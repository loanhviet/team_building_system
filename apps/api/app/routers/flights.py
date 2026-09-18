from datetime import datetime
from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.time import utcnow
from app.db.session import lock_sqlite_write_transaction
from app.models.auth import User
from app.models.bus import Bus, BusAssignment
from app.models.event import Event, Shift, TransportLeg
from app.models.flight import Flight, FlightAssignment
from app.models.organization import Employee, Site
from app.models.registration import Registration
from app.models.system import AllocationRun, Job
from app.schemas.flight import (
    AdjustAssignmentRequest,
    AllocationEnqueuedOut,
    AllocationRequest,
    AllocationRunOut,
    FlightAssignmentOut,
    FlightCreate,
    FlightOut,
    FlightUpdate,
    UnlockAssignmentRequest,
)
from app.services import master_data
from app.services.allocation.base import preset_weights
from app.services.allocation.bus_greedy import bus_compatible
from app.services.audit_service import record_audit
from app.services.event_service import assert_allocation_allowed, assert_event_not_completed
from app.services.importer.xlsx import load_xlsx, read_xlsx
from app.services.notification.email_service import PUBLISHED_STATUSES, notify_employees
from app.services.xlsx_export import xlsx_file

router = APIRouter(prefix="/events/{event_id}", tags=["flights"])

AdminUser = Annotated[User, Depends(require_admin)]

REQUIRED_IMPORT_HEADERS = {"flight_code", "direction", "capacity"}


async def _validate_flight_references(
    db: DbSession, event_id: int, shift_id: int | None, site_id: int | None
) -> None:
    if shift_id is not None:
        shift = await db.get(Shift, shift_id)
        if shift is None or shift.event_id != event_id:
            raise AppError("invalid_shift", "Ca bay không thuộc sự kiện này", status.HTTP_400_BAD_REQUEST)
    if site_id is not None and await db.get(Site, site_id) is None:
        raise AppError("invalid_site", "Địa điểm làm việc không tồn tại", status.HTTP_400_BAD_REQUEST)


@router.get("/flights", response_model=list[FlightOut])
async def list_flights(
    event_id: int, db: DbSession, _user: AdminUser, direction: str | None = None
) -> list[Flight]:
    stmt = select(Flight).where(Flight.event_id == event_id)
    if direction:
        stmt = stmt.where(Flight.direction == direction)
    result = await db.execute(stmt.order_by(Flight.depart_at))
    return list(result.scalars().all())


@router.post("/flights", response_model=FlightOut, status_code=status.HTTP_201_CREATED)
async def create_flight(
    event_id: int, payload: FlightCreate, db: DbSession, user: AdminUser
) -> Flight:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    await _validate_flight_references(db, event_id, payload.shift_id, payload.site_id)
    flight = await master_data.create(db, Flight, payload.model_dump(), event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="flight", entity_id=flight.id,
        after=payload.model_dump(mode="json"), event_id=event_id,
    )
    await db.commit()
    await db.refresh(flight)
    return flight


# fields that matter to a passenger already booked on the flight — changing
# any of these after publish is what triggers the "flight_changed" email
PASSENGER_FACING_FIELDS = {"flight_code", "direction", "site_id", "depart_at", "arrive_at"}


@router.patch("/flights/{flight_id}", response_model=FlightOut)
async def update_flight(
    event_id: int,
    flight_id: int,
    payload: FlightUpdate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> Flight:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    flight = await master_data.get_or_404(db, Flight, flight_id, event_id=event_id)
    before = FlightOut.model_validate(flight).model_dump(mode="json")
    data = payload.model_dump(exclude_unset=True)

    await _validate_flight_references(
        db, event_id, data.get("shift_id", flight.shift_id), data.get("site_id", flight.site_id)
    )
    final_depart = data.get("depart_at", flight.depart_at)
    final_arrive = data.get("arrive_at", flight.arrive_at)
    if final_depart and final_arrive and final_arrive <= final_depart:
        raise AppError(
            "invalid_flight_time", "Giờ đến phải sau giờ khởi hành", status.HTTP_400_BAD_REQUEST
        )

    assigned_ids = [
        row[0]
        for row in (
            await db.execute(
                select(FlightAssignment.employee_id).where(
                    FlightAssignment.flight_id == flight_id
                )
            )
        ).all()
    ]
    if assigned_ids and data.get("direction", flight.direction) != flight.direction:
        raise AppError(
            "flight_direction_in_use",
            "Không thể đổi chiều của chuyến đã có người; hãy bỏ phân bổ trước",
            status.HTTP_409_CONFLICT,
        )
    final_site_id = data.get("site_id", flight.site_id)
    if assigned_ids and final_site_id is not None:
        mismatches = (
            await db.execute(
                select(func.count(Employee.id)).where(
                    Employee.id.in_(assigned_ids),
                    Employee.site_id.is_not(None),
                    Employee.site_id != final_site_id,
                )
            )
        ).scalar_one()
        if mismatches:
            raise AppError(
                "flight_site_in_use",
                f"Thay đổi này làm {mismatches} người ở sai site; hãy phân lại trước",
                status.HTTP_409_CONFLICT,
            )

    if data.get("capacity") is not None:
        assigned_count = (
            await db.execute(
                select(func.count(FlightAssignment.id)).where(
                    FlightAssignment.flight_id == flight_id
                )
            )
        ).scalar_one()
        if data["capacity"] < assigned_count:
            raise AppError(
                "capacity_below_assigned",
                f"Chuyến này đã có {assigned_count} người, không thể đặt sức chứa thấp hơn",
                status.HTTP_409_CONFLICT,
            )

    await master_data.update(db, flight, data)

    if assigned_ids and ("depart_at" in data or "arrive_at" in data):
        dependent = await db.execute(
            select(BusAssignment, Bus, TransportLeg)
            .join(Bus, Bus.id == BusAssignment.bus_id)
            .join(TransportLeg, TransportLeg.id == BusAssignment.leg_id)
            .where(
                BusAssignment.event_id == event_id,
                BusAssignment.employee_id.in_(assigned_ids),
                TransportLeg.direction == flight.direction,
                TransportLeg.flight_timing.is_not(None),
            )
        )
        for bus_assignment, bus, leg in dependent.all():
            compatible = bus_compatible(
                bus.pickup_point_id,
                bus.depart_at,
                None,
                flight.depart_at,
                flight.arrive_at,
                leg.flight_timing,
            )
            if not compatible:
                bus_assignment.is_flagged = True
                bus_assignment.flag_reason = "flight_timing_mismatch"
    after = FlightOut.model_validate(flight).model_dump(mode="json")
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="flight", entity_id=flight_id,
        before=before, after=after, event_id=event_id,
    )
    await db.commit()
    await db.refresh(flight)

    changed_passenger_fields = any(before.get(f) != after.get(f) for f in PASSENGER_FACING_FIELDS)
    if changed_passenger_fields and event.status.value in PUBLISHED_STATUSES:
        result = await db.execute(
            select(FlightAssignment.employee_id).where(
                FlightAssignment.event_id == event_id, FlightAssignment.flight_id == flight_id
            )
        )
        employee_ids = [row[0] for row in result.all()]
        await notify_employees(
            db, queue, event, employee_ids, "flight_changed",
            dedupe_suffix=f"{flight_id}:{utcnow().isoformat()}",
        )

    return flight


@router.post("/flights/import")
async def import_flights(
    event_id: int, db: DbSession, user: AdminUser, file: UploadFile
) -> dict:
    """Small dataset (a handful of flights) — parsed synchronously, no queue needed."""
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    content = await read_xlsx(file)
    workbook = load_xlsx(content)
    sheet = workbook.active
    rows_iter = sheet.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if header_row is None:
        raise AppError("empty_file", "File rỗng", status.HTTP_400_BAD_REQUEST)

    headers = [str(h).strip().lower() if h is not None else "" for h in header_row]
    missing = REQUIRED_IMPORT_HEADERS - set(headers)
    if missing:
        raise AppError(
            "missing_headers", f"File thiếu cột bắt buộc: {', '.join(sorted(missing))}",
            status.HTTP_400_BAD_REQUEST,
        )

    sites_by_code = {
        s.code: s.id for s in (await db.execute(select(Site))).scalars().all()
    }

    ok_rows = 0
    errors: list[dict] = []
    for index, raw_row in enumerate(rows_iter, start=2):
        if raw_row is None or all(v is None for v in raw_row):
            continue
        row = {headers[i]: raw_row[i] for i in range(len(headers)) if headers[i]}
        try:
            async with db.begin_nested():
                direction = str(row["direction"]).strip().lower()
                if direction not in ("outbound", "inbound"):
                    raise ValueError("direction phải là outbound hoặc inbound")
                depart_at = row.get("depart_at")
                arrive_at = row.get("arrive_at")
                flight_code = str(row["flight_code"]).strip()
                site_code = str(row["site_code"]).strip() if row.get("site_code") else None
                if site_code and site_code not in sites_by_code:
                    raise ValueError(f"site_code '{site_code}' không tồn tại")

                # upsert by (event_id, flight_code): re-importing the same file
                # (or a corrected one) updates the existing flight in place
                # instead of creating a duplicate every time
                existing = await db.execute(
                    select(Flight).where(
                        Flight.event_id == event_id, Flight.flight_code == flight_code
                    )
                )
                flight = existing.scalar_one_or_none()
                if flight is None:
                    flight = Flight(event_id=event_id, flight_code=flight_code)
                    db.add(flight)

                flight.airline = str(row["airline"]).strip() if row.get("airline") else None
                flight.direction = direction
                flight.site_id = sites_by_code.get(site_code) if site_code else None
                flight.depart_at = depart_at if isinstance(depart_at, datetime) else None
                flight.arrive_at = arrive_at if isinstance(arrive_at, datetime) else None
                flight.origin = str(row["origin"]).strip() if row.get("origin") else None
                flight.destination = (
                    str(row["destination"]).strip() if row.get("destination") else None
                )
                flight.capacity = int(row["capacity"])
                flight.note = str(row["note"]).strip() if row.get("note") else None
                await db.flush()
            ok_rows += 1
        except Exception as exc:  # noqa: BLE001
            errors.append({"row": index, "error": str(exc)})

    await db.commit()
    await record_audit(
        db, actor_user_id=user.id, action="import", entity_type="flight", entity_id=event_id,
        after={"ok_rows": ok_rows, "error_rows": len(errors)}, event_id=event_id,
    )
    await db.commit()
    return {"ok_rows": ok_rows, "error_rows": len(errors), "errors": errors}


@router.get("/flights/import-template")
async def download_flight_template(event_id: int, _user: AdminUser) -> object:
    return xlsx_file(
        "Chuyen bay",
        ["flight_code", "direction", "capacity", "site_code", "airline", "origin", "destination", "depart_at", "arrive_at", "note"],
        [["VN123", "outbound", 180, "HN", "Vietnam Airlines", "HAN", "DAD", "2026-12-20 08:00", "2026-12-20 09:20", ""]],
        f"flights_template_event_{event_id}.xlsx",
    )


@router.get("/flight-assignments/export")
async def export_flight_assignments(
    event_id: int, db: DbSession, _user: AdminUser, direction: str | None = None
) -> object:
    stmt = (
        select(FlightAssignment, Flight)
        .outerjoin(Flight, Flight.id == FlightAssignment.flight_id)
        .options(selectinload(FlightAssignment.employee).selectinload(Employee.team))
        .where(FlightAssignment.event_id == event_id)
    )
    if direction:
        stmt = stmt.where(FlightAssignment.direction == direction)
    result = await db.execute(stmt)
    rows = []
    for assignment, flight in result.all():
        emp = assignment.employee
        rows.append([
            emp.employee_code or "",
            emp.full_name,
            emp.team.name if emp.team else "",
            assignment.direction,
            flight.flight_code if flight else "",
            assignment.source,
            assignment.flag_reason or "",
        ])
    return xlsx_file(
        "Phan bay",
        ["employee_code", "full_name", "team", "direction", "flight_code", "source", "flag"],
        rows,
        f"flight_assignments_event_{event_id}.xlsx",
    )


@router.get("/flight-assignments", response_model=list[FlightAssignmentOut])
async def list_flight_assignments(
    event_id: int, db: DbSession, _user: AdminUser, direction: str | None = None
) -> list[FlightAssignmentOut]:
    stmt = (
        select(FlightAssignment)
        .options(selectinload(FlightAssignment.employee).selectinload(Employee.team))
        .where(FlightAssignment.event_id == event_id)
    )
    if direction:
        stmt = stmt.where(FlightAssignment.direction == direction)
    result = await db.execute(stmt)
    assignments = result.scalars().all()

    shift_by_employee: dict[int, str] = {}
    if assignments:
        reg_rows = await db.execute(
            select(Registration.employee_id, Shift.name)
            .join(Shift, Shift.id == Registration.shift_id)
            .where(Registration.event_id == event_id)
        )
        shift_by_employee = dict(reg_rows.all())

    out = []
    for a in assignments:
        out.append(
            FlightAssignmentOut(
                id=a.id,
                flight_id=a.flight_id,
                employee_id=a.employee_id,
                direction=a.direction,
                source=a.source,
                is_locked=a.is_locked,
                is_flagged=a.is_flagged,
                flag_reason=a.flag_reason,
                employee_code=a.employee.employee_code,
                full_name=a.employee.full_name,
                team_name=a.employee.team.name if a.employee.team else None,
                employee_site_id=a.employee.site_id,
                requested_shift_name=shift_by_employee.get(a.employee_id),
            )
        )
    return out


async def _flight_preflight(db: DbSession, event_id: int, direction: str) -> dict:
    participant_rows = (
        await db.execute(
            select(Employee.site_id)
            .join(Registration, Registration.employee_id == Employee.id)
            .where(
                Registration.event_id == event_id,
                Registration.status == "submitted",
                Registration.is_participating.is_(True),
            )
        )
    ).all()
    participant_sites = {row[0] for row in participant_rows if row[0] is not None}
    flights = list(
        (
            await db.execute(
                select(Flight).where(
                    Flight.event_id == event_id, Flight.direction == direction
                )
            )
        ).scalars().all()
    )
    blockers: list[dict] = []
    warnings: list[dict] = []
    if not flights:
        blockers.append({"code": "no_flights", "message": "Chưa có chuyến bay trong chiều này"})
    if len(participant_sites) > 1 and any(f.site_id is None for f in flights):
        blockers.append({
            "code": "flight_site_required",
            "message": "Sự kiện có nhiều địa điểm; mọi chuyến bay phải được gán site",
        })
    # A seat shortfall is a warning, not a blocker. The allocator is built for
    # exactly this case — it places everyone it can and writes the overflow as
    # `flight_id=None, flag_reason="no_slot"` rows so BTC can resolve them in the
    # workbench (BRD §5.3). Blocking the run instead meant a single missing seat
    # made flight allocation impossible for the other 96 people, and BTC could
    # never even reach the flagged-case workflow the workbench exists for.
    for site_id in sorted(participant_sites):
        needed = sum(1 for row in participant_rows if row[0] == site_id)
        capacity = sum(f.capacity for f in flights if f.site_id in (None, site_id))
        if capacity < needed:
            warnings.append({
                "code": "insufficient_capacity",
                "message": f"Site #{site_id} thiếu {needed - capacity} chỗ bay — "
                f"{needed - capacity} người sẽ bị gắn cờ 'chưa có chỗ' để BTC xử lý tay",
            })
    if any(row[0] is None for row in participant_rows):
        warnings.append({
            "code": "employee_site_missing",
            "message": "Có nhân sự chưa được gán địa điểm làm việc",
        })
    return {
        "ready": not blockers,
        "blockers": blockers,
        "warnings": warnings,
        "eligible": len(participant_rows),
        "capacity": sum(f.capacity for f in flights),
        "resources": len(flights),
    }


@router.get("/allocations/flight/preflight")
async def flight_allocation_preflight(
    event_id: int, direction: str, db: DbSession, _user: AdminUser
) -> dict:
    if direction not in ("outbound", "inbound"):
        raise AppError("invalid_direction", "Chiều bay không hợp lệ", status.HTTP_400_BAD_REQUEST)
    await master_data.get_or_404(db, Event, event_id)
    return await _flight_preflight(db, event_id, direction)


@router.post(
    "/allocations/flight", response_model=AllocationEnqueuedOut, status_code=status.HTTP_202_ACCEPTED
)
async def run_flight_allocation_endpoint(
    event_id: int,
    payload: AllocationRequest,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> AllocationEnqueuedOut:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_allocation_allowed(event)
    preflight = await _flight_preflight(db, event_id, payload.direction)
    if not preflight["ready"]:
        raise AppError(
            "allocation_not_ready",
            "; ".join(item["message"] for item in preflight["blockers"]),
            status.HTTP_409_CONFLICT,
        )

    run = AllocationRun(
        event_id=event_id,
        type="flight",
        params_json={"direction": payload.direction, "preset": payload.preset or "event_settings"},
        status="running",
        created_by=user.id,
    )
    db.add(run)
    await db.flush()

    job = Job(
        type="flight_allocation",
        status="queued",
        params_json={"allocation_run_id": run.id, "event_id": event_id},
        created_by=user.id,
    )
    db.add(job)
    await db.flush()
    run.job_id = job.id
    await db.commit()
    await db.refresh(job)
    await db.refresh(run)

    arq_job = await queue.enqueue_job(
        "run_flight_allocation_task", job.id, run.id, event_id, payload.direction,
        preset_weights("flight", payload.preset) if payload.preset else None,
    )
    if arq_job is not None:
        job.arq_job_id = arq_job.job_id
        await db.commit()

    return AllocationEnqueuedOut(job_id=job.id, allocation_run_id=run.id)


@router.get("/allocations", response_model=list[AllocationRunOut])
async def list_allocation_runs(
    event_id: int, db: DbSession, _user: AdminUser, type_filter: str | None = None
) -> list[AllocationRun]:
    stmt = select(AllocationRun).where(AllocationRun.event_id == event_id)
    if type_filter:
        stmt = stmt.where(AllocationRun.type == type_filter)
    result = await db.execute(stmt.order_by(AllocationRun.created_at.desc()))
    return list(result.scalars().all())


@router.post("/flight-assignments/adjust")
async def adjust_flight_assignments(
    event_id: int,
    payload: AdjustAssignmentRequest,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> dict:
    await lock_sqlite_write_transaction(db)
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    # Lock the resource before measuring capacity. Every manual move into a
    # flight uses this same lock, preventing concurrent requests from all
    # accepting the same final seat.
    target_flight = (
        await db.execute(
            select(Flight)
            .where(Flight.id == payload.flight_id, Flight.event_id == event_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if target_flight is None:
        raise AppError("not_found", "Flight not found", status.HTTP_404_NOT_FOUND)

    employee_ids = set(payload.employee_ids)
    if payload.team_id is not None:
        team_result = await db.execute(
            select(Registration.employee_id)
            .join(Employee, Employee.id == Registration.employee_id)
            .where(
                Registration.event_id == event_id,
                Registration.status == "submitted",
                Registration.is_participating.is_(True),
                Employee.team_id == payload.team_id,
            )
        )
        employee_ids |= {row[0] for row in team_result.all()}

    if not employee_ids:
        raise AppError(
            "no_employees", "Không có CBNV nào để chuyển (kiểm tra employee_ids/team_id)",
            status.HTTP_400_BAD_REQUEST,
        )

    # every id must actually belong to a submitted registration in *this* event,
    # otherwise a bogus/foreign id would hit the FK constraint on insert below
    # and surface as an unhandled 500 instead of a clear 400
    valid_result = await db.execute(
        select(Registration.employee_id).where(
            Registration.event_id == event_id,
            Registration.employee_id.in_(employee_ids),
            Registration.status == "submitted",
            Registration.is_participating.is_(True),
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
    if target_flight.site_id is not None:
        mismatch_result = await db.execute(
            select(Employee.employee_code).where(
                Employee.id.in_(employee_ids),
                Employee.site_id.is_not(None),
                Employee.site_id != target_flight.site_id,
            )
        )
        mismatched_codes = [row[0] or "?" for row in mismatch_result.all()]
        if mismatched_codes:
            raise AppError(
                "site_mismatch",
                f"Chuyến {target_flight.flight_code} không phục vụ địa điểm làm việc của: "
                f"{', '.join(sorted(mismatched_codes))}",
                status.HTTP_409_CONFLICT,
            )

    result = await db.execute(
        select(FlightAssignment).where(
            FlightAssignment.event_id == event_id,
            FlightAssignment.direction == target_flight.direction,
            FlightAssignment.flight_id == target_flight.id,
        ).with_for_update()
    )
    current_on_target = {a.employee_id for a in result.scalars().all()}
    moving_in = employee_ids - current_on_target
    would_be_count = len(current_on_target) + len(moving_in)

    if would_be_count > target_flight.capacity:
        raise AppError(
            "over_capacity",
            f"Chuyến {target_flight.flight_code} có {target_flight.capacity} chỗ, "
            f"sau khi chuyển sẽ có {would_be_count} người",
            status.HTTP_409_CONFLICT,
        )

    mismatched_shift_ids: set[int] = set()
    if target_flight.shift_id is not None:
        shift_result = await db.execute(
            select(Registration.employee_id).where(
                Registration.event_id == event_id,
                Registration.employee_id.in_(employee_ids),
                Registration.shift_id.is_not(None),
                Registration.shift_id != target_flight.shift_id,
            )
        )
        mismatched_shift_ids = {row[0] for row in shift_result.all()}
        if mismatched_shift_ids and not payload.accept_soft_warnings:
            raise AppError(
                "soft_warning_required",
                f"Có {len(mismatched_shift_ids)} người lệch ca đăng ký. Hãy xác nhận để tiếp tục.",
                status.HTTP_409_CONFLICT,
            )
        if mismatched_shift_ids:
            warnings.append("shift_mismatch")

    for employee_id in employee_ids:
        result = await db.execute(
            select(FlightAssignment).where(
                FlightAssignment.event_id == event_id,
                FlightAssignment.direction == target_flight.direction,
                FlightAssignment.employee_id == employee_id,
            ).with_for_update()
        )
        assignment = result.scalar_one_or_none()
        before = (
            {"flight_id": assignment.flight_id, "is_locked": assignment.is_locked}
            if assignment
            else None
        )
        if assignment is None:
            assignment = FlightAssignment(
                event_id=event_id, employee_id=employee_id, direction=target_flight.direction
            )
            db.add(assignment)

        assignment.flight_id = target_flight.id
        assignment.source = "manual"
        assignment.is_locked = True
        assignment.is_flagged = employee_id in mismatched_shift_ids
        assignment.flag_reason = "shift_mismatch" if assignment.is_flagged else None
        assignment.assigned_by = user.id
        assignment.assigned_at = utcnow()

        await record_audit(
            db, actor_user_id=user.id, action="manual_reassign", entity_type="flight_assignment",
            entity_id=employee_id, before=before,
            after={"flight_id": target_flight.id, "is_locked": True}, reason=payload.reason,
            event_id=event_id,
        )

    await db.commit()

    if event.status.value in ("information_published", "event_started"):
        await notify_employees(
            db, queue, event, list(employee_ids), "flight_changed",
            dedupe_suffix=utcnow().isoformat(),
        )

    return {"moved": len(employee_ids), "warnings": warnings}


@router.post("/flight-assignments/unlock")
async def unlock_flight_assignments(
    event_id: int, payload: UnlockAssignmentRequest, db: DbSession, user: AdminUser
) -> dict:
    """Reverses `is_locked=True` from a manual reassign so a later auto-run can
    reconsider these people again (BRD §5.5 assumes adjustments are correctable,
    not a one-way pin)."""
    await master_data.get_or_404(db, Event, event_id)
    result = await db.execute(
        select(FlightAssignment).where(
            FlightAssignment.event_id == event_id,
            FlightAssignment.direction == payload.direction,
            FlightAssignment.employee_id.in_(payload.employee_ids),
            FlightAssignment.is_locked.is_(True),
        )
    )
    assignments = result.scalars().all()
    for a in assignments:
        a.is_locked = False
    await record_audit(
        db, actor_user_id=user.id, action="unlock", entity_type="flight_assignment",
        entity_id=event_id, after={"employee_ids": [a.employee_id for a in assignments]},
        event_id=event_id,
    )
    await db.commit()
    return {"unlocked": len(assignments)}
