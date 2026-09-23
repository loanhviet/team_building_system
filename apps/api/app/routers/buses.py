import io
from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.time import utcnow
from app.db.session import lock_sqlite_write_transaction
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
from app.services.allocation.base import preset_weights
from app.services.allocation.bus_greedy import bus_compatible
from app.services.audit_service import record_audit
from app.services.event_service import assert_allocation_allowed, assert_event_not_completed
from app.services.leg_pickup import pickup_constraint
from app.services.notification.email_service import PUBLISHED_STATUSES, notify_employees

router = APIRouter(prefix="/events/{event_id}", tags=["buses"])

AdminUser = Annotated[User, Depends(require_admin)]


async def _validate_bus_references(
    db: DbSession, event_id: int, leg_id: int, pickup_point_id: int | None
) -> None:
    leg = await db.get(TransportLeg, leg_id)
    if leg is None or leg.event_id != event_id:
        raise AppError("invalid_leg", "Chặng xe không thuộc sự kiện này", status.HTTP_400_BAD_REQUEST)
    if pickup_point_id is not None:
        point = await db.get(PickupPoint, pickup_point_id)
        if point is None or point.event_id != event_id:
            raise AppError(
                "invalid_pickup_point", "Điểm đón không thuộc sự kiện này", status.HTTP_400_BAD_REQUEST
            )


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
    await _validate_bus_references(db, event_id, payload.leg_id, payload.pickup_point_id)
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
    data = payload.model_dump(exclude_unset=True)
    await _validate_bus_references(
        db, event_id, bus.leg_id, data.get("pickup_point_id", bus.pickup_point_id)
    )
    if data.get("capacity") is not None:
        assigned_count = (
            await db.execute(
                select(func.count(BusAssignment.id)).where(BusAssignment.bus_id == bus_id)
            )
        ).scalar_one()
        if data["capacity"] < assigned_count:
            raise AppError(
                "capacity_below_assigned",
                f"Xe này đã có {assigned_count} người, không thể đặt sức chứa thấp hơn",
                status.HTTP_409_CONFLICT,
            )
    final_gather = data.get("gather_at", bus.gather_at)
    final_depart = data.get("depart_at", bus.depart_at)
    if final_gather and final_depart and final_depart < final_gather:
        raise AppError(
            "invalid_bus_time", "Giờ khởi hành không được trước giờ tập trung", status.HTTP_400_BAD_REQUEST
        )
    assigned_ids = [
        row[0]
        for row in (
            await db.execute(
                select(BusAssignment.employee_id).where(BusAssignment.bus_id == bus_id)
            )
        ).all()
    ]
    if assigned_ids and ({"pickup_point_id", "depart_at"} & data.keys()):
        leg = await db.get(TransportLeg, bus.leg_id)
        needs = await db.execute(
            select(Registration.employee_id, RegistrationTransportNeed.pickup_point_id)
            .join(
                RegistrationTransportNeed,
                RegistrationTransportNeed.registration_id == Registration.id,
            )
            .where(
                Registration.event_id == event_id,
                Registration.employee_id.in_(assigned_ids),
                RegistrationTransportNeed.leg_id == bus.leg_id,
            )
        )
        raw_pickups = dict(needs.all())
        kind_ids = {pickup_id for pickup_id in raw_pickups.values() if pickup_id is not None}
        pickup_kinds: dict[int, str] = {}
        if kind_ids:
            pickup_kinds = dict(
                (
                    await db.execute(
                        select(PickupPoint.id, PickupPoint.kind).where(PickupPoint.id.in_(kind_ids))
                    )
                ).all()
            )
        pickup_by_employee = {
            employee_id: pickup_constraint(
                leg.direction, leg.flight_timing, pickup_id,
                pickup_kinds.get(pickup_id) if pickup_id is not None else None,
            )
            for employee_id, pickup_id in raw_pickups.items()
        } if leg is not None else raw_pickups
        flight_by_employee = (
            await _flight_times_by_employee(db, event_id, leg.direction)
            if leg is not None and leg.direction in ("outbound", "inbound")
            else {}
        )
        incompatible = 0
        for employee_id in assigned_ids:
            _flight_id, _code, flight_depart, flight_arrive = flight_by_employee.get(
                employee_id, (None, None, None, None)
            )
            if not bus_compatible(
                data.get("pickup_point_id", bus.pickup_point_id),
                final_depart,
                pickup_by_employee.get(employee_id),
                flight_depart,
                flight_arrive,
                leg.flight_timing if leg else None,
            ):
                incompatible += 1
        if incompatible:
            raise AppError(
                "bus_change_incompatible",
                f"Thay đổi này làm {incompatible} người sai điểm đón/giờ bay; hãy phân lại trước",
                status.HTTP_409_CONFLICT,
            )
    await master_data.update(db, bus, data)
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
            select(BusAssignment.employee_id).where(
                BusAssignment.event_id == event_id, BusAssignment.bus_id == bus_id
            )
        )
        employee_ids = [row[0] for row in result.all()]
        await notify_employees(
            db, queue, event, employee_ids, "bus_changed",
            dedupe_suffix=f"{bus_id}:{utcnow().isoformat()}",
        )

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


async def _bus_preflight(db: DbSession, event_id: int, leg_id: int) -> dict:
    leg = await db.get(TransportLeg, leg_id)
    if leg is None or leg.event_id != event_id:
        raise AppError("invalid_leg", "Chặng xe không thuộc sự kiện này", status.HTTP_400_BAD_REQUEST)
    needs = (
        await db.execute(
            select(Registration.employee_id, RegistrationTransportNeed.pickup_point_id)
            .join(
                RegistrationTransportNeed,
                RegistrationTransportNeed.registration_id == Registration.id,
            )
            .where(
                Registration.event_id == event_id,
                Registration.status == "submitted",
                Registration.is_participating.is_(True),
                RegistrationTransportNeed.leg_id == leg_id,
                RegistrationTransportNeed.is_needed.is_(True),
            )
        )
    ).all()
    pickup_ids = {pickup_id for _employee_id, pickup_id in needs if pickup_id is not None}
    pickup_kinds: dict[int, str] = {}
    if pickup_ids:
        pickup_kinds = dict(
            (
                await db.execute(
                    select(PickupPoint.id, PickupPoint.kind).where(PickupPoint.id.in_(pickup_ids))
                )
            ).all()
        )
    needs = [
        (
            employee_id,
            pickup_constraint(
                leg.direction,
                leg.flight_timing,
                pickup_id,
                pickup_kinds.get(pickup_id) if pickup_id is not None else None,
            ),
        )
        for employee_id, pickup_id in needs
    ]
    buses = list(
        (
            await db.execute(
                select(Bus).where(Bus.event_id == event_id, Bus.leg_id == leg_id)
            )
        ).scalars().all()
    )
    blockers: list[dict] = []
    warnings: list[dict] = []
    if not buses:
        blockers.append({"code": "no_buses", "message": "Chưa có xe cho chặng này"})
    if sum(b.capacity for b in buses) < len(needs):
        # warning, not a blocker — same reasoning as the flight preflight: the
        # allocator records the overflow as flagged `bus_id=None` rows for BTC
        # instead of refusing to run
        warnings.append({
            "code": "insufficient_capacity",
            "message": f"Chặng xe thiếu {len(needs) - sum(b.capacity for b in buses)} chỗ — "
            "số người dôi ra sẽ bị gắn cờ để BTC xếp tay",
        })
    requested_points = {row[1] for row in needs if row[1] is not None}
    served_points = {b.pickup_point_id for b in buses if b.pickup_point_id is not None}
    # a bus with no pickup point picks up everyone (see bus_compatible), so one
    # of those on the leg covers every requested point — destination legs are
    # entirely made of those and used to be blocked here for all 4 points
    serves_any_point = any(b.pickup_point_id is None for b in buses)
    missing_points = set() if serves_any_point else requested_points - served_points
    if missing_points:
        blockers.append({
            "code": "pickup_not_served",
            "message": f"Có {len(missing_points)} điểm đón chưa có xe phục vụ",
        })
    if leg.flight_timing and any(b.depart_at is None for b in buses):
        blockers.append({
            "code": "bus_departure_required",
            "message": "Mọi xe của chặng liên quan chuyến bay phải có giờ khởi hành",
        })
    if leg.flight_timing:
        flight_by_employee = await _flight_times_by_employee(db, event_id, leg.direction)
        missing_flight_data = []
        no_compatible_bus = []
        for employee_id, pickup_point_id in needs:
            flight = flight_by_employee.get(employee_id)
            if flight is None or (
                leg.flight_timing == "before_flight" and flight[2] is None
            ) or (leg.flight_timing == "after_flight" and flight[3] is None):
                missing_flight_data.append(employee_id)
                continue
            if buses and not any(
                bus_compatible(
                    bus.pickup_point_id,
                    bus.depart_at,
                    pickup_point_id,
                    flight[2],
                    flight[3],
                    leg.flight_timing,
                )
                for bus in buses
            ):
                no_compatible_bus.append(employee_id)
        if missing_flight_data:
            # A blocker only when flight allocation hasn't run for this direction
            # at all — that's the case bus_runner itself refuses, because every
            # candidate would fall through with no flight time to compare
            # against. When *some* people have flights, the missing few are
            # normally just the `no_slot` overflow from the flight run; those
            # come out flagged per-person, so don't stop BTC from allocating the
            # other 80.
            issue = {
                "code": "flight_allocation_required",
                "message": f"Có {len(missing_flight_data)} người chưa có chuyến/giờ bay phù hợp",
            }
            (blockers if not flight_by_employee else warnings).append(issue)
        if no_compatible_bus:
            warnings.append({
                "code": "no_compatible_bus",
                "message": f"Có {len(no_compatible_bus)} người chưa có xe khớp điểm đón và giờ bay "
                "— sẽ bị gắn cờ để BTC xếp tay",
            })
    if any(bus.pickup_point_id is not None for bus in buses) and any(row[1] is None for row in needs):
        warnings.append({
            "code": "pickup_missing",
            "message": "Có nhân sự cần xe nhưng chưa chọn điểm đón",
        })
    return {
        "ready": not blockers,
        "blockers": blockers,
        "warnings": warnings,
        "eligible": len(needs),
        "capacity": sum(b.capacity for b in buses),
        "resources": len(buses),
    }


@router.get("/allocations/bus/preflight")
async def bus_allocation_preflight(
    event_id: int, leg_id: int, db: DbSession, _user: AdminUser
) -> dict:
    await master_data.get_or_404(db, Event, event_id)
    return await _bus_preflight(db, event_id, leg_id)


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
    preflight = await _bus_preflight(db, event_id, payload.leg_id)
    if not preflight["ready"]:
        raise AppError(
            "allocation_not_ready",
            "; ".join(item["message"] for item in preflight["blockers"]),
            status.HTTP_409_CONFLICT,
        )

    run = AllocationRun(
        event_id=event_id, type="bus",
        params_json={"leg_id": payload.leg_id, "preset": payload.preset or "event_settings"},
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
        "run_bus_allocation_task", job.id, run.id, event_id, payload.leg_id,
        preset_weights("bus", payload.preset) if payload.preset else None,
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
    await lock_sqlite_write_transaction(db)
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    target_bus = (
        await db.execute(
            select(Bus).where(Bus.id == payload.bus_id, Bus.event_id == event_id).with_for_update()
        )
    ).scalar_one_or_none()
    if target_bus is None:
        raise AppError("not_found", "Bus not found", status.HTTP_404_NOT_FOUND)

    employee_ids = set(payload.employee_ids)
    if payload.team_id is not None:
        team_result = await db.execute(
            select(Registration.employee_id)
            .join(Employee, Employee.id == Registration.employee_id)
            .join(
                RegistrationTransportNeed,
                RegistrationTransportNeed.registration_id == Registration.id,
            )
            .where(
                Registration.event_id == event_id,
                Registration.status == "submitted",
                Registration.is_participating.is_(True),
                RegistrationTransportNeed.leg_id == target_bus.leg_id,
                RegistrationTransportNeed.is_needed.is_(True),
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
        select(Registration.employee_id)
        .join(
            RegistrationTransportNeed,
            RegistrationTransportNeed.registration_id == Registration.id,
        )
        .where(
            Registration.event_id == event_id,
            Registration.employee_id.in_(employee_ids),
            Registration.status == "submitted",
            Registration.is_participating.is_(True),
            RegistrationTransportNeed.leg_id == target_bus.leg_id,
            RegistrationTransportNeed.is_needed.is_(True),
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

    warnings: list[str] = []
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
        raw_pickups = dict(pickup_result.all())
        kind_ids = {pickup_id for pickup_id in raw_pickups.values() if pickup_id is not None}
        pickup_kinds: dict[int, str] = {}
        if kind_ids:
            pickup_kinds = dict(
                (
                    await db.execute(
                        select(PickupPoint.id, PickupPoint.kind).where(PickupPoint.id.in_(kind_ids))
                    )
                ).all()
            )
        pickup_by_employee = {
            employee_id: pickup_constraint(
                target_leg.direction,
                target_leg.flight_timing,
                pickup_id,
                pickup_kinds.get(pickup_id) if pickup_id is not None else None,
            )
            for employee_id, pickup_id in raw_pickups.items()
        }
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
            raise AppError(
                "bus_incompatible",
                f"Xe {target_bus.code} không khớp điểm đón/giờ bay đã đăng ký của: "
                f"{', '.join(sorted(incompatible_codes))}",
                status.HTTP_409_CONFLICT,
            )

    result = await db.execute(
        select(BusAssignment).where(
            BusAssignment.event_id == event_id,
            BusAssignment.leg_id == target_bus.leg_id,
            BusAssignment.bus_id == target_bus.id,
        ).with_for_update()
    )
    current_on_target = {a.employee_id for a in result.scalars().all()}
    moving_in = employee_ids - current_on_target
    would_be_count = len(current_on_target) + len(moving_in)

    if would_be_count > target_bus.capacity:
        raise AppError(
            "over_capacity",
            f"Xe {target_bus.code} có {target_bus.capacity} chỗ, "
            f"sau khi chuyển sẽ có {would_be_count} người",
            status.HTTP_409_CONFLICT,
        )

    for employee_id in employee_ids:
        result = await db.execute(
            select(BusAssignment).where(
                BusAssignment.event_id == event_id,
                BusAssignment.leg_id == target_bus.leg_id,
                BusAssignment.employee_id == employee_id,
            ).with_for_update()
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
        await notify_employees(
            db, queue, event, list(employee_ids), "bus_changed",
            dedupe_suffix=utcnow().isoformat(),
        )

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
