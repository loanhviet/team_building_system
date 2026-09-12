import io
from datetime import datetime
from typing import Annotated

import openpyxl
from arq import ArqRedis
from fastapi import APIRouter, Depends, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.deps import DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.time import utcnow
from app.models.auth import User
from app.models.event import Event
from app.models.flight import Flight, FlightAssignment
from app.models.organization import Employee
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
)
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.notification.email_service import enqueue_email
from app.services.xlsx_export import xlsx_file

router = APIRouter(prefix="/events/{event_id}", tags=["flights"])

AdminUser = Annotated[User, Depends(require_admin)]
settings = get_settings()

REQUIRED_IMPORT_HEADERS = {"flight_code", "direction", "capacity"}


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
    flight = await master_data.create(db, Flight, payload.model_dump(), event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="flight", entity_id=flight.id,
        after=payload.model_dump(mode="json"), event_id=event_id,
    )
    await db.commit()
    await db.refresh(flight)
    return flight


@router.patch("/flights/{flight_id}", response_model=FlightOut)
async def update_flight(
    event_id: int, flight_id: int, payload: FlightUpdate, db: DbSession, user: AdminUser
) -> Flight:
    flight = await master_data.get_or_404(db, Flight, flight_id, event_id=event_id)
    before = FlightOut.model_validate(flight).model_dump(mode="json")
    await master_data.update(db, flight, payload.model_dump(exclude_unset=True))
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="flight", entity_id=flight_id,
        before=before, after=FlightOut.model_validate(flight).model_dump(mode="json"),
        event_id=event_id,
    )
    await db.commit()
    await db.refresh(flight)
    return flight


@router.post("/flights/import")
async def import_flights(
    event_id: int, db: DbSession, user: AdminUser, file: UploadFile
) -> dict:
    """Small dataset (a handful of flights) — parsed synchronously, no queue needed."""
    await master_data.get_or_404(db, Event, event_id)
    content = await file.read()
    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
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
                flight = Flight(
                    event_id=event_id,
                    flight_code=str(row["flight_code"]).strip(),
                    airline=str(row["airline"]).strip() if row.get("airline") else None,
                    direction=direction,
                    depart_at=depart_at if isinstance(depart_at, datetime) else None,
                    arrive_at=arrive_at if isinstance(arrive_at, datetime) else None,
                    origin=str(row["origin"]).strip() if row.get("origin") else None,
                    destination=(
                        str(row["destination"]).strip() if row.get("destination") else None
                    ),
                    capacity=int(row["capacity"]),
                    note=str(row["note"]).strip() if row.get("note") else None,
                )
                db.add(flight)
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
        ["flight_code", "direction", "capacity", "airline", "origin", "destination", "depart_at", "arrive_at", "note"],
        [["VN123", "outbound", 180, "Vietnam Airlines", "HAN", "DAD", "2026-12-20 08:00", "2026-12-20 09:20", ""]],
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
    out = []
    for a in result.scalars().all():
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
            )
        )
    return out


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
    await master_data.get_or_404(db, Event, event_id)

    run = AllocationRun(
        event_id=event_id,
        type="flight",
        params_json={"direction": payload.direction, "weights": payload.weights},
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
        "run_flight_allocation_task", job.id, run.id, event_id, payload.direction, payload.weights
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
    event = await master_data.get_or_404(db, Event, event_id)
    target_flight = await master_data.get_or_404(db, Flight, payload.flight_id, event_id=event_id)

    result = await db.execute(
        select(FlightAssignment).where(
            FlightAssignment.event_id == event_id,
            FlightAssignment.direction == target_flight.direction,
            FlightAssignment.flight_id == target_flight.id,
        )
    )
    current_on_target = {a.employee_id for a in result.scalars().all()}
    moving_in = set(payload.employee_ids) - current_on_target
    would_be_count = len(current_on_target) + len(moving_in)

    warnings = []
    if would_be_count > target_flight.capacity:
        if not payload.force:
            raise AppError(
                "over_capacity",
                f"Chuyến {target_flight.flight_code} chỉ còn sức chứa {target_flight.capacity}, "
                f"sau khi chuyển sẽ có {would_be_count} người",
                status.HTTP_409_CONFLICT,
            )
        warnings.append("over_capacity_forced")

    for employee_id in payload.employee_ids:
        result = await db.execute(
            select(FlightAssignment).where(
                FlightAssignment.event_id == event_id,
                FlightAssignment.direction == target_flight.direction,
                FlightAssignment.employee_id == employee_id,
            )
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
        assignment.is_flagged = False
        assignment.flag_reason = None
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
        for employee_id in payload.employee_ids:
            employee = await db.get(Employee, employee_id)
            if employee is None:
                continue
            await enqueue_email(
                db, queue, event_id=event_id, to_email=employee.email,
                template_code="flight_changed",
                payload={
                    "full_name": employee.full_name, "event_name": event.name,
                    "app_url": settings.app_base_url,
                },
                dedupe_key=f"flight_changed:{event_id}:{employee_id}:{utcnow().isoformat()}",
            )
        await db.commit()

    return {"moved": len(payload.employee_ids), "warnings": warnings}
