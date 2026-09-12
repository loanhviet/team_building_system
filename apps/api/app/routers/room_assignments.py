import io
from typing import Annotated

import openpyxl
from fastapi import APIRouter, Depends, UploadFile, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession, require_admin
from app.core.errors import AppError
from app.core.time import utcnow
from app.models.auth import User
from app.models.hotel import Hotel, Room, RoomAssignment
from app.models.organization import Employee
from app.models.registration import Registration
from app.schemas.hotel import ImportResultOut, RoomAssignmentCreate, RoomAssignmentOut
from app.services.audit_service import record_audit
from app.services.xlsx_export import xlsx_file

router = APIRouter(prefix="/events/{event_id}/room-assignments", tags=["room-assignments"])

AdminUser = Annotated[User, Depends(require_admin)]


def _assignment_out(a: RoomAssignment, room: Room, hotel: Hotel) -> RoomAssignmentOut:
    return RoomAssignmentOut(
        id=a.id,
        room_id=a.room_id,
        employee_id=a.employee_id,
        source=a.source,
        employee_code=a.employee.employee_code,
        full_name=a.employee.full_name,
        team_name=a.employee.team.name if a.employee.team else None,
        hotel_name=hotel.name,
        room_number=room.room_number,
        assigned_at=a.assigned_at,
    )


async def _list_with_room_hotel(db: DbSession, event_id: int) -> list[tuple[RoomAssignment, Room, Hotel]]:
    result = await db.execute(
        select(RoomAssignment, Room, Hotel)
        .join(Room, Room.id == RoomAssignment.room_id)
        .join(Hotel, Hotel.id == Room.hotel_id)
        .options(selectinload(RoomAssignment.employee).selectinload(Employee.team))
        .where(RoomAssignment.event_id == event_id)
    )
    return list(result.all())


@router.get("", response_model=list[RoomAssignmentOut])
async def list_room_assignments(event_id: int, db: DbSession, _user: AdminUser) -> list[RoomAssignmentOut]:
    rows = await _list_with_room_hotel(db, event_id)
    return [_assignment_out(a, r, h) for a, r, h in rows]


@router.get("/unassigned")
async def list_unassigned(event_id: int, db: DbSession, _user: AdminUser) -> list[dict]:
    result = await db.execute(
        select(Employee.id, Employee.employee_code, Employee.full_name)
        .join(Registration, Registration.employee_id == Employee.id)
        .outerjoin(
            RoomAssignment,
            (RoomAssignment.employee_id == Employee.id) & (RoomAssignment.event_id == event_id),
        )
        .where(
            Registration.event_id == event_id,
            Registration.status == "submitted",
            Registration.is_participating.is_(True),
            RoomAssignment.id.is_(None),
        )
    )
    return [
        {"employee_id": row[0], "employee_code": row[1], "full_name": row[2]}
        for row in result.all()
    ]


@router.post("/assign", response_model=RoomAssignmentOut)
async def assign_room(
    event_id: int, payload: RoomAssignmentCreate, db: DbSession, user: AdminUser
) -> RoomAssignmentOut:
    room = await db.get(Room, payload.room_id)
    if room is None:
        raise AppError("not_found", "Room not found", status.HTTP_404_NOT_FOUND)
    hotel = await db.get(Hotel, room.hotel_id)
    if hotel is None or hotel.event_id != event_id:
        raise AppError("not_found", "Room không thuộc event này", status.HTTP_404_NOT_FOUND)

    reg_result = await db.execute(
        select(Registration.id).where(
            Registration.event_id == event_id,
            Registration.employee_id == payload.employee_id,
            Registration.status == "submitted",
        )
    )
    if reg_result.scalar_one_or_none() is None:
        raise AppError(
            "invalid_employee_id",
            "CBNV không có đăng ký hợp lệ trong sự kiện này",
            status.HTTP_400_BAD_REQUEST,
        )

    result = await db.execute(select(RoomAssignment).where(RoomAssignment.room_id == room.id))
    occupants = result.scalars().all()
    already_here = any(a.employee_id == payload.employee_id for a in occupants)
    if not already_here and len(occupants) >= room.capacity:
        raise AppError(
            "room_full",
            f"Phòng {room.room_number} đã đủ {room.capacity} người",
            status.HTTP_409_CONFLICT,
        )

    result = await db.execute(
        select(RoomAssignment).where(
            RoomAssignment.event_id == event_id, RoomAssignment.employee_id == payload.employee_id
        )
    )
    assignment = result.scalar_one_or_none()
    before = {"room_id": assignment.room_id} if assignment else None
    if assignment is None:
        assignment = RoomAssignment(event_id=event_id, employee_id=payload.employee_id)
        db.add(assignment)
    assignment.room_id = room.id
    assignment.source = "manual"
    assignment.assigned_by = user.id
    assignment.assigned_at = utcnow()
    await db.flush()

    await record_audit(
        db, actor_user_id=user.id, action="assign", entity_type="room_assignment",
        entity_id=payload.employee_id, before=before, after={"room_id": room.id},
        event_id=event_id,
    )
    await db.commit()
    result = await db.execute(
        select(RoomAssignment)
        .options(selectinload(RoomAssignment.employee).selectinload(Employee.team))
        .where(RoomAssignment.id == assignment.id)
    )
    assignment = result.scalar_one()
    return _assignment_out(assignment, room, hotel)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unassign_room(event_id: int, assignment_id: int, db: DbSession, user: AdminUser) -> None:
    assignment = await db.get(RoomAssignment, assignment_id)
    if assignment is None or assignment.event_id != event_id:
        raise AppError("not_found", "Room assignment not found", status.HTTP_404_NOT_FOUND)
    await record_audit(
        db, actor_user_id=user.id, action="cancel", entity_type="room_assignment",
        entity_id=assignment.employee_id, before={"room_id": assignment.room_id}, event_id=event_id,
    )
    await db.delete(assignment)
    await db.commit()


@router.get("/import-template")
async def download_room_assignment_template(event_id: int, _user: AdminUser) -> object:
    return xlsx_file(
        "Phan phong",
        ["employee_code", "email", "room_number"],
        [["NV001", "nv001@company.vn", "101"]],
        f"room_assignments_template_event_{event_id}.xlsx",
    )


@router.post("/import", response_model=ImportResultOut)
async def import_room_assignments(event_id: int, db: DbSession, user: AdminUser, file: UploadFile) -> ImportResultOut:
    """employee_code (or email), room_number — matched within this event's hotels."""
    content = await file.read()
    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    rows_iter = sheet.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    headers = (
        [str(h).strip().lower() if h is not None else "" for h in header_row]
        if header_row
        else []
    )
    if "room_number" not in headers or ("employee_code" not in headers and "email" not in headers):
        raise AppError(
            "missing_headers",
            "File cần cột room_number và (employee_code hoặc email)",
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
                employee = None
                if row.get("employee_code"):
                    result = await db.execute(
                        select(Employee).where(
                            Employee.employee_code == str(row["employee_code"]).strip()
                        )
                    )
                    employee = result.scalar_one_or_none()
                if employee is None and row.get("email"):
                    result = await db.execute(
                        select(Employee).where(
                            Employee.email == str(row["email"]).strip().lower()
                        )
                    )
                    employee = result.scalar_one_or_none()
                if employee is None:
                    raise ValueError("Không tìm thấy nhân viên")

                result = await db.execute(
                    select(Room)
                    .join(Hotel, Hotel.id == Room.hotel_id)
                    .where(Hotel.event_id == event_id, Room.room_number == str(row["room_number"]).strip())
                )
                room = result.scalar_one_or_none()
                if room is None:
                    raise ValueError(f"Không tìm thấy phòng {row['room_number']}")

                result = await db.execute(
                    select(RoomAssignment).where(RoomAssignment.room_id == room.id)
                )
                occupants = result.scalars().all()
                if not any(a.employee_id == employee.id for a in occupants) and (
                    len(occupants) >= room.capacity
                ):
                    raise ValueError(f"Phòng {room.room_number} đã đủ người")

                result = await db.execute(
                    select(RoomAssignment).where(
                        RoomAssignment.event_id == event_id,
                        RoomAssignment.employee_id == employee.id,
                    )
                )
                assignment = result.scalar_one_or_none()
                if assignment is None:
                    assignment = RoomAssignment(event_id=event_id, employee_id=employee.id)
                    db.add(assignment)
                assignment.room_id = room.id
                assignment.source = "import"
                assignment.assigned_by = user.id
                assignment.assigned_at = utcnow()
                await db.flush()
            ok_rows += 1
        except Exception as exc:  # noqa: BLE001
            errors.append({"row": index, "error": str(exc)})

    await db.commit()
    await record_audit(
        db, actor_user_id=user.id, action="import", entity_type="room_assignment", entity_id=event_id,
        after={"ok_rows": ok_rows, "error_rows": len(errors)}, event_id=event_id,
    )
    await db.commit()
    return ImportResultOut(ok_rows=ok_rows, error_rows=len(errors), errors=errors)


@router.get("/export")
async def export_room_assignments(event_id: int, db: DbSession, _user: AdminUser) -> StreamingResponse:
    rows = await _list_with_room_hotel(db, event_id)

    wb = Workbook()
    ws = wb.active
    ws.title = "Phân phòng"
    ws.append(["Mã NV", "Họ tên", "Team", "Khách sạn", "Phòng"])
    for a, r, h in rows:
        ws.append([a.employee.employee_code or "", a.employee.full_name,
                   a.employee.team.name if a.employee.team else "", h.name, r.room_number])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=room_assignments_event_{event_id}.xlsx"},
    )
