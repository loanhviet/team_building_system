import io
from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.deps import DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.time import utcnow
from app.models.auth import User
from app.models.bus import Bus, BusAssignment
from app.models.event import Event, PickupPoint, TransportLeg
from app.models.flight import Flight, FlightAssignment
from app.models.organization import Employee
from app.models.registration import Registration, RegistrationTransportNeed
from app.models.system import AllocationRun, Job
from app.schemas.bus import (
    BusAdjustRequest,
    BusAllocationRequest,
    BusAssignmentOut,
    BusCreate,
    BusOut,
    BusUpdate,
    UnlockBusAssignmentRequest,
)
from app.schemas.flight import AllocationEnqueuedOut, AllocationRunOut
from app.services import master_data
from app.services.allocation.bus_greedy import bus_compatible
from app.services.audit_service import record_audit
from app.services.event_service import assert_allocation_allowed, assert_event_not_completed
from app.services.notification.email_service import (
    PUBLISHED_STATUSES,
    dispatch_email,
    enqueue_email,
)

router = APIRouter(prefix="/events/{event_id}", tags=["buses"])

AdminUser = Annotated[User, Depends(require_admin)]
settings = get_settings()


async def _flight_times_by_employee(
    db: DbSession, event_id: int, direction: str
) -> dict[int, tuple[int, str, object, object]]:
    """employee_id -> (flight_id, flight_code, depart_at, arrive_at) for a
    flight direction — shared by list/adjust so pickup/timing checks and the
    flight_code column read the same data."""
    result = await db.execute(
        select(
            FlightAssignment.employee_id, Flight.id, Flight.flight_code,
            Flight.depart_at, Flight.arrive_at,
        )
        .join(Flight, Flight.id == FlightAssignment.flight_id)
        .where(
            FlightAssignment.event_id == event_id,
            FlightAssignment.direction == direction,
            FlightAssignment.flight_id.is_not(None),
        )
    )
    return {
        eid: (fid, code, depart_at, arrive_at)
        for eid, fid, code, depart_at, arrive_at in result.all()
    }


@router.get("/buses", response_model=list[BusOut])
async def list_buses(
    event_id: int, db: DbSession, _user: AdminUser, leg_id: int | None = None
) -> list[Bus]:
    stmt = select(Bus).where(Bus.event_id == event_id)
    if leg_id is not None:
        stmt = stmt.where(Bus.leg_id == leg_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/buses", response_model=BusOut, status_code=status.HTTP_201_CREATED)
async def create_bus(event_id: int, payload: BusCreate, db: DbSession, user: AdminUser) -> Bus:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    bus = await master_data.create(db, Bus, payload.model_dump(), event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="bus", entity_id=bus.id,
        after=payload.model_dump(mode="json"), event_id=event_id,
    )
    await db.commit()
    await db.refresh(bus)
    return bus


# fields that matter to someone already booked on this bus
PASSENGER_FACING_BUS_FIELDS = {
    "gather_at", "depart_at", "pickup_point_id", "destination", "leader_name", "leader_phone",
}


@router.patch("/buses/{bus_id}", response_model=BusOut)
async def update_bus(
    event_id: int,
    bus_id: int,
    payload: BusUpdate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> Bus:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    bus = await master_data.get_or_404(db, Bus, bus_id, event_id=event_id)
    before = BusOut.model_validate(bus).model_dump(mode="json")
    await master_data.update(db, bus, payload.model_dump(exclude_unset=True))
    after = BusOut.model_validate(bus).model_dump(mode="json")
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="bus", entity_id=bus_id,
        before=before, after=after, event_id=event_id,
    )
    await db.commit()
    await db.refresh(bus)

    changed_passenger_fields = any(before.get(f) != after.get(f) for f in PASSENGER_FACING_BUS_FIELDS)
    if changed_passenger_fields and event.status.value in PUBLISHED_STATUSES:
        result = await db.execute(
            select(Employee).join(
                BusAssignment, BusAssignment.employee_id == Employee.id
            ).where(BusAssignment.event_id == event_id, BusAssignment.bus_id == bus_id)
        )
        outbox_ids = []
        for employee in result.scalars().all():
            outbox_id = await enqueue_email(
                db, event_id=event_id, to_email=employee.email,
                template_code="bus_changed",
                payload={
                    "full_name": employee.full_name, "event_name": event.name,
                    "bus_code": bus.code, "app_url": settings.app_base_url,
                },
                dedupe_key=f"bus_changed:{event_id}:{employee.id}:{bus_id}:{utcnow().isoformat()}",
            )
            outbox_ids.append(outbox_id)
        await db.commit()
        for outbox_id in outbox_ids:
            await dispatch_email(queue, outbox_id)

    return bus


@router.get("/bus-assignments", response_model=list[BusAssignmentOut])
async def list_bus_assignments(
    event_id: int, db: DbSession, _user: AdminUser, leg_id: int | None = None
) -> list[BusAssignmentOut]:
    stmt = (
        select(BusAssignment)
        .options(selectinload(BusAssignment.employee).selectinload(Employee.team))
        .where(BusAssignment.event_id == event_id)
    )
    if leg_id is not None:
        stmt = stmt.where(BusAssignment.leg_id == leg_id)
    result = await db.execute(stmt)
    assignments = result.scalars().all()

    # requested pickup point per (employee, leg) — only fetched for the legs
    # actually present in this result, so an unfiltered "all legs" call
    # doesn't pull the whole event's transport_needs for nothing
    leg_ids = {a.leg_id for a in assignments}
    pickup_by_employee_leg: dict[tuple[int, int], str] = {}
    flight_by_employee_by_direction: dict[str, dict[int, tuple[int, str, object, object]]] = {}
    if leg_ids:
        legs = {
            leg.id: leg
            for leg in (
                await db.execute(select(TransportLeg).where(TransportLeg.id.in_(leg_ids)))
            ).scalars().all()
        }
        need_result = await db.execute(
            select(
                Registration.employee_id, RegistrationTransportNeed.leg_id, PickupPoint.name,
            )
            .join(Registration, Registration.id == RegistrationTransportNeed.registration_id)
            .join(PickupPoint, PickupPoint.id == RegistrationTransportNeed.pickup_point_id)
            .where(
                Registration.event_id == event_id,
                RegistrationTransportNeed.leg_id.in_(leg_ids),
            )
        )
        pickup_by_employee_leg = {
            (eid, lid): name for eid, lid, name in need_result.all()
        }
        for direction in {leg.direction for leg in legs.values() if leg.direction in ("outbound", "inbound")}:
            flight_by_employee_by_direction[direction] = await _flight_times_by_employee(
                db, event_id, direction
            )

    out = []
    for a in assignments:
        leg = legs.get(a.leg_id) if leg_ids else None
        flight_row = (
            flight_by_employee_by_direction.get(leg.direction, {}).get(a.employee_id)
            if leg is not None
            else None
        )
        out.append(
            BusAssignmentOut(
                id=a.id, bus_id=a.bus_id, employee_id=a.employee_id, leg_id=a.leg_id,
                source=a.source, is_locked=a.is_locked, is_flagged=a.is_flagged,
                flag_reason=a.flag_reason, employee_code=a.employee.employee_code,
                full_name=a.employee.full_name,
                team_name=a.employee.team.name if a.employee.team else None,
                requested_pickup_point_name=pickup_by_employee_leg.get((a.employee_id, a.leg_id)),
                flight_code=flight_row[1] if flight_row else None,
            )
        )
    return out


@router.post(
    "/allocations/bus", response_model=AllocationEnqueuedOut, status_code=status.HTTP_202_ACCEPTED
)
async def run_bus_allocation_endpoint(
    event_id: int,
    payload: BusAllocationRequest,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> AllocationEnqueuedOut:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_allocation_allowed(event)

    run = AllocationRun(
        event_id=event_id, type="bus", params_json={"leg_id": payload.leg_id},
        status="running", created_by=user.id,
    )
    db.add(run)
    await db.flush()

    job = Job(
        type="bus_allocation", status="queued",
        params_json={"allocation_run_id": run.id, "event_id": event_id, "leg_id": payload.leg_id},
        created_by=user.id,
    )
    db.add(job)
    await db.flush()
    run.job_id = job.id
    await db.commit()
    await db.refresh(job)
    await db.refresh(run)

    arq_job = await queue.enqueue_job(
        "run_bus_allocation_task", job.id, run.id, event_id, payload.leg_id
    )
    if arq_job is not None:
        job.arq_job_id = arq_job.job_id
        await db.commit()

    return AllocationEnqueuedOut(job_id=job.id, allocation_run_id=run.id)


@router.get("/allocations/bus/history", response_model=list[AllocationRunOut])
async def list_bus_allocation_runs(event_id: int, db: DbSession, _user: AdminUser) -> list[AllocationRun]:
    result = await db.execute(
        select(AllocationRun)
        .where(AllocationRun.event_id == event_id, AllocationRun.type == "bus")
        .order_by(AllocationRun.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/bus-assignments/adjust")
async def adjust_bus_assignments(
    event_id: int,
    payload: BusAdjustRequest,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> dict:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    target_bus = await master_data.get_or_404(db, Bus, payload.bus_id, event_id=event_id)

    employee_ids = set(payload.employee_ids)
    if payload.team_id is not None:
        team_result = await db.execute(
            select(Registration.employee_id)
            .join(Employee, Employee.id == Registration.employee_id)
            .where(
                Registration.event_id == event_id,
                Registration.status == "submitted",
                Employee.team_id == payload.team_id,
            )
        )
        employee_ids |= {row[0] for row in team_result.all()}

    if not employee_ids:
        raise AppError(
            "no_employees", "Không có CBNV nào để chuyển (kiểm tra employee_ids/team_id)",
            status.HTTP_400_BAD_REQUEST,
        )

    # every id must belong to a submitted registration in *this* event, otherwise
    # a bogus/foreign id would hit the FK constraint on insert below and surface
    # as an unhandled 500 instead of a clear 400
    valid_result = await db.execute(
        select(Registration.employee_id).where(
            Registration.event_id == event_id,
            Registration.employee_id.in_(employee_ids),
            Registration.status == "submitted",
        )
    )
    valid_ids = {row[0] for row in valid_result.all()}
    invalid_ids = employee_ids - valid_ids
    if invalid_ids:
        raise AppError(
            "invalid_employee_ids",
            f"Các mã CBNV không có đăng ký hợp lệ trong sự kiện này: {sorted(invalid_ids)}",
            status.HTTP_400_BAD_REQUEST,
        )
    employee_ids = valid_ids

    warnings = []
    target_leg = await db.get(TransportLeg, target_bus.leg_id)
    if target_leg is not None:
        pickup_result = await db.execute(
            select(Registration.employee_id, RegistrationTransportNeed.pickup_point_id)
            .join(Registration, Registration.id == RegistrationTransportNeed.registration_id)
            .where(
                Registration.event_id == event_id,
                Registration.employee_id.in_(employee_ids),
                RegistrationTransportNeed.leg_id == target_bus.leg_id,
            )
        )
        pickup_by_employee = dict(pickup_result.all())
        flight_by_employee = (
            await _flight_times_by_employee(db, event_id, target_leg.direction)
            if target_leg.direction in ("outbound", "inbound")
            else {}
        )
        code_result = await db.execute(
            select(Employee.id, Employee.employee_code).where(Employee.id.in_(employee_ids))
        )
        code_by_employee = dict(code_result.all())

        incompatible_codes = []
        for employee_id in employee_ids:
            _fid, _code, flight_depart_at, flight_arrive_at = flight_by_employee.get(
                employee_id, (None, None, None, None)
            )
            if not bus_compatible(
                target_bus.pickup_point_id, target_bus.depart_at,
                pickup_by_employee.get(employee_id), flight_depart_at, flight_arrive_at,
                target_leg.flight_timing,
            ):
                incompatible_codes.append(code_by_employee.get(employee_id) or "?")
        if incompatible_codes:
            if not payload.force:
                raise AppError(
                    "bus_incompatible",
                    f"Xe {target_bus.code} không khớp điểm đón/giờ bay đã đăng ký của: "
                    f"{', '.join(sorted(incompatible_codes))}",
                    status.HTTP_409_CONFLICT,
                )
            warnings.append("bus_incompatible_forced")

    result = await db.execute(
        select(BusAssignment).where(
            BusAssignment.event_id == event_id,
            BusAssignment.leg_id == target_bus.leg_id,
            BusAssignment.bus_id == target_bus.id,
        )
    )
    current_on_target = {a.employee_id for a in result.scalars().all()}
    moving_in = employee_ids - current_on_target
    would_be_count = len(current_on_target) + len(moving_in)

    if would_be_count > target_bus.capacity:
        if not payload.force:
            raise AppError(
                "over_capacity",
                f"Xe {target_bus.code} chỉ còn sức chứa {target_bus.capacity}, "
                f"sau khi chuyển sẽ có {would_be_count} người",
                status.HTTP_409_CONFLICT,
            )
        warnings.append("over_capacity_forced")

    for employee_id in employee_ids:
        result = await db.execute(
            select(BusAssignment).where(
                BusAssignment.event_id == event_id,
                BusAssignment.leg_id == target_bus.leg_id,
                BusAssignment.employee_id == employee_id,
            )
        )
        assignment = result.scalar_one_or_none()
        before = {"bus_id": assignment.bus_id} if assignment else None
        if assignment is None:
            assignment = BusAssignment(
                event_id=event_id, leg_id=target_bus.leg_id, employee_id=employee_id
            )
            db.add(assignment)

        assignment.bus_id = target_bus.id
        assignment.source = "manual"
        assignment.is_locked = True
        assignment.is_flagged = False
        assignment.flag_reason = None
        assignment.assigned_by = user.id
        assignment.assigned_at = utcnow()

        await record_audit(
            db, actor_user_id=user.id, action="manual_reassign", entity_type="bus_assignment",
            entity_id=employee_id, before=before, after={"bus_id": target_bus.id},
            reason=payload.reason, event_id=event_id,
        )

    await db.commit()
    if event.status.value in ("information_published", "event_started"):
        outbox_ids = []
        for employee_id in employee_ids:
            employee = await db.get(Employee, employee_id)
            if employee is None:
                continue
            outbox_id = await enqueue_email(
                db, event_id=event_id, to_email=employee.email,
                template_code="bus_changed",
                payload={
                    "full_name": employee.full_name, "event_name": event.name,
                    "app_url": settings.app_base_url,
                },
                dedupe_key=f"bus_changed:{event_id}:{employee_id}:{utcnow().isoformat()}",
            )
            outbox_ids.append(outbox_id)
        await db.commit()
        # dispatch only after commit — see enqueue_email's docstring
        for outbox_id in outbox_ids:
            await dispatch_email(queue, outbox_id)

    return {"moved": len(employee_ids), "warnings": warnings}


@router.post("/bus-assignments/unlock")
async def unlock_bus_assignments(
    event_id: int, payload: UnlockBusAssignmentRequest, db: DbSession, user: AdminUser
) -> dict:
    """Same reasoning as the flight unlock endpoint: a manual bus reassign
    pins `is_locked=True` forever otherwise, so a later auto-run could never
    reconsider these people again."""
    await master_data.get_or_404(db, Event, event_id)
    result = await db.execute(
        select(BusAssignment).where(
            BusAssignment.event_id == event_id,
            BusAssignment.leg_id == payload.leg_id,
            BusAssignment.employee_id.in_(payload.employee_ids),
            BusAssignment.is_locked.is_(True),
        )
    )
    assignments = result.scalars().all()
    for a in assignments:
        a.is_locked = False
    await record_audit(
        db, actor_user_id=user.id, action="unlock", entity_type="bus_assignment",
        entity_id=event_id, after={"employee_ids": [a.employee_id for a in assignments]},
        event_id=event_id,
    )
    await db.commit()
    return {"unlocked": len(assignments)}


@router.get("/bus-assignments/export")
async def export_bus_assignments(
    event_id: int, db: DbSession, _user: AdminUser, leg_id: int | None = None
) -> StreamingResponse:
    stmt = (
        select(BusAssignment, Bus)
        .join(Bus, Bus.id == BusAssignment.bus_id, isouter=True)
        .options(selectinload(BusAssignment.employee).selectinload(Employee.team))
        .where(BusAssignment.event_id == event_id)
    )
    if leg_id is not None:
        stmt = stmt.where(BusAssignment.leg_id == leg_id)
    result = await db.execute(stmt)

    wb = Workbook()
    ws = wb.active
    ws.title = "Phân xe"
    ws.append(["Mã NV", "Họ tên", "Team", "Xe", "Trưởng xe", "SĐT Trưởng xe", "Ghi chú"])
    for a, bus in result.all():
        ws.append([
            a.employee.employee_code or "", a.employee.full_name,
            a.employee.team.name if a.employee.team else "",
            bus.code if bus else "Chưa xếp",
            bus.leader_name if bus else "", bus.leader_phone if bus else "",
            a.flag_reason or "",
        ])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=bus_assignments_event_{event_id}.xlsx"},
    )
