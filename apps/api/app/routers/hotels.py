from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile, status
from sqlalchemy import select

from app.core.deps import DbSession, require_admin
from app.core.errors import AppError
from app.models.auth import User
from app.models.hotel import Hotel, Room, RoomAssignment, RoomType
from app.schemas.hotel import (
    HotelCreate,
    HotelOut,
    HotelUpdate,
    ImportResultOut,
    RoomCreate,
    RoomOut,
    RoomTypeCreate,
    RoomTypeOut,
    RoomTypeUpdate,
    RoomUpdate,
)
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.importer.xlsx import load_xlsx, read_xlsx
from app.services.xlsx_export import xlsx_file

router = APIRouter(prefix="/events/{event_id}", tags=["hotels"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.get("/hotels", response_model=list[HotelOut])
async def list_hotels(event_id: int, db: DbSession, _user: AdminUser) -> list[Hotel]:
    return await master_data.list_all(db, Hotel, event_id=event_id)


@router.post("/hotels", response_model=HotelOut, status_code=status.HTTP_201_CREATED)
async def create_hotel(event_id: int, payload: HotelCreate, db: DbSession, user: AdminUser) -> Hotel:
    data = payload.model_dump()
    data["code"] = data["code"].upper()
    exists = await db.execute(
        select(Hotel.id).where(Hotel.event_id == event_id, Hotel.code == data["code"])
    )
    if exists.first() is not None:
        raise AppError("hotel_code_exists", "Mã khách sạn đã tồn tại", status.HTTP_409_CONFLICT)
    hotel = await master_data.create(db, Hotel, data, event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="hotel", entity_id=hotel.id,
        after=payload.model_dump(mode="json"), event_id=event_id,
    )
    await db.commit()
    await db.refresh(hotel)
    return hotel


@router.patch("/hotels/{hotel_id}", response_model=HotelOut)
async def update_hotel(
    event_id: int, hotel_id: int, payload: HotelUpdate, db: DbSession, user: AdminUser
) -> Hotel:
    hotel = await master_data.get_or_404(db, Hotel, hotel_id, event_id=event_id)
    before = HotelOut.model_validate(hotel).model_dump(mode="json")
    data = payload.model_dump(exclude_unset=True)
    if "code" in data:
        data["code"] = data["code"].upper()
        exists = await db.execute(
            select(Hotel.id).where(
                Hotel.event_id == event_id,
                Hotel.code == data["code"],
                Hotel.id != hotel_id,
            )
        )
        if exists.first() is not None:
            raise AppError("hotel_code_exists", "Mã khách sạn đã tồn tại", status.HTTP_409_CONFLICT)
    final_checkin = data.get("checkin_date", hotel.checkin_date)
    final_checkout = data.get("checkout_date", hotel.checkout_date)
    if final_checkin and final_checkout and final_checkout <= final_checkin:
        raise AppError(
            "invalid_hotel_dates", "Ngày trả phòng phải sau ngày nhận phòng", status.HTTP_400_BAD_REQUEST
        )
    await master_data.update(db, hotel, data)
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="hotel", entity_id=hotel_id,
        before=before, after=HotelOut.model_validate(hotel).model_dump(mode="json"),
        event_id=event_id,
    )
    await db.commit()
    await db.refresh(hotel)
    return hotel


async def _get_hotel_or_404(db: DbSession, event_id: int, hotel_id: int) -> Hotel:
    return await master_data.get_or_404(db, Hotel, hotel_id, event_id=event_id)


@router.get("/hotels/{hotel_id}/room-types", response_model=list[RoomTypeOut])
async def list_room_types(
    event_id: int, hotel_id: int, db: DbSession, _user: AdminUser
) -> list[RoomType]:
    await _get_hotel_or_404(db, event_id, hotel_id)
    result = await db.execute(select(RoomType).where(RoomType.hotel_id == hotel_id))
    return list(result.scalars().all())


@router.post(
    "/hotels/{hotel_id}/room-types", response_model=RoomTypeOut, status_code=status.HTTP_201_CREATED
)
async def create_room_type(
    event_id: int, hotel_id: int, payload: RoomTypeCreate, db: DbSession, user: AdminUser
) -> RoomType:
    await _get_hotel_or_404(db, event_id, hotel_id)
    room_type = RoomType(hotel_id=hotel_id, **payload.model_dump())
    db.add(room_type)
    await db.flush()
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="room_type", entity_id=room_type.id,
        after=payload.model_dump(), event_id=event_id,
    )
    await db.commit()
    await db.refresh(room_type)
    return room_type


@router.patch("/hotels/{hotel_id}/room-types/{room_type_id}", response_model=RoomTypeOut)
async def update_room_type(
    event_id: int,
    hotel_id: int,
    room_type_id: int,
    payload: RoomTypeUpdate,
    db: DbSession,
    user: AdminUser,
) -> RoomType:
    await _get_hotel_or_404(db, event_id, hotel_id)
    room_type = await master_data.get_or_404(db, RoomType, room_type_id)
    if room_type.hotel_id != hotel_id:
        raise AppError("not_found", "RoomType not found", status.HTTP_404_NOT_FOUND)
    before = RoomTypeOut.model_validate(room_type).model_dump(mode="json")
    await master_data.update(db, room_type, payload.model_dump(exclude_unset=True))
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="room_type", entity_id=room_type_id,
        before=before, after=RoomTypeOut.model_validate(room_type).model_dump(mode="json"),
        event_id=event_id,
    )
    await db.commit()
    await db.refresh(room_type)
    return room_type


@router.delete("/hotels/{hotel_id}/room-types/{room_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room_type(
    event_id: int, hotel_id: int, room_type_id: int, db: DbSession, user: AdminUser
) -> None:
    await _get_hotel_or_404(db, event_id, hotel_id)
    room_type = await master_data.get_or_404(db, RoomType, room_type_id)
    if room_type.hotel_id != hotel_id:
        raise AppError("not_found", "RoomType not found", status.HTTP_404_NOT_FOUND)
    result = await db.execute(select(Room.id).where(Room.room_type_id == room_type_id))
    if result.first() is not None:
        raise AppError(
            "room_type_in_use", "Không thể xoá: còn phòng đang dùng loại phòng này",
            status.HTTP_409_CONFLICT,
        )
    await db.delete(room_type)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="room_type", entity_id=room_type_id,
        event_id=event_id,
    )
    await db.commit()


@router.get("/hotels/{hotel_id}/rooms", response_model=list[RoomOut])
async def list_rooms(event_id: int, hotel_id: int, db: DbSession, _user: AdminUser) -> list[RoomOut]:
    await _get_hotel_or_404(db, event_id, hotel_id)
    result = await db.execute(select(Room).where(Room.hotel_id == hotel_id))
    rooms = result.scalars().all()

    occ_result = await db.execute(
        select(RoomAssignment.room_id, RoomAssignment.id).where(
            RoomAssignment.room_id.in_([r.id for r in rooms])
        )
    )
    occupied_counts: dict[int, int] = {}
    for room_id, _ in occ_result.all():
        occupied_counts[room_id] = occupied_counts.get(room_id, 0) + 1

    return [
        RoomOut(
            id=r.id, hotel_id=r.hotel_id, room_number=r.room_number, room_type_id=r.room_type_id,
            capacity=r.capacity, note=r.note, occupied=occupied_counts.get(r.id, 0),
        )
        for r in rooms
    ]


@router.post("/hotels/{hotel_id}/rooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    event_id: int, hotel_id: int, payload: RoomCreate, db: DbSession, user: AdminUser
) -> RoomOut:
    await _get_hotel_or_404(db, event_id, hotel_id)
    if payload.room_type_id is not None:
        room_type = await db.get(RoomType, payload.room_type_id)
        if room_type is None or room_type.hotel_id != hotel_id:
            raise AppError(
                "invalid_room_type", "Loại phòng không thuộc khách sạn này", status.HTTP_400_BAD_REQUEST
            )
    room = Room(hotel_id=hotel_id, **payload.model_dump())
    db.add(room)
    await db.flush()
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="room", entity_id=room.id,
        after=payload.model_dump(), event_id=event_id,
    )
    await db.commit()
    await db.refresh(room)
    return RoomOut(
        id=room.id, hotel_id=room.hotel_id, room_number=room.room_number,
        room_type_id=room.room_type_id, capacity=room.capacity, note=room.note, occupied=0,
    )


@router.patch("/hotels/{hotel_id}/rooms/{room_id}", response_model=RoomOut)
async def update_room(
    event_id: int, hotel_id: int, room_id: int, payload: RoomUpdate, db: DbSession, user: AdminUser
) -> RoomOut:
    await _get_hotel_or_404(db, event_id, hotel_id)
    room = await master_data.get_or_404(db, Room, room_id)
    if room.hotel_id != hotel_id:
        raise AppError("not_found", "Room not found", status.HTTP_404_NOT_FOUND)
    before = {"room_number": room.room_number, "capacity": room.capacity}
    data = payload.model_dump(exclude_unset=True)
    if data.get("room_type_id") is not None:
        room_type = await db.get(RoomType, data["room_type_id"])
        if room_type is None or room_type.hotel_id != hotel_id:
            raise AppError(
                "invalid_room_type", "Loại phòng không thuộc khách sạn này", status.HTTP_400_BAD_REQUEST
            )
    occupied = (
        await db.execute(
            select(RoomAssignment.id).where(RoomAssignment.room_id == room.id)
        )
    ).scalars().all()
    if data.get("capacity") is not None and data["capacity"] < len(occupied):
        raise AppError(
            "capacity_below_assigned",
            f"Phòng đang có {len(occupied)} người, không thể giảm sức chứa thấp hơn",
            status.HTTP_409_CONFLICT,
        )
    await master_data.update(db, room, data)
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="room", entity_id=room_id,
        before=before, after={"room_number": room.room_number, "capacity": room.capacity},
        event_id=event_id,
    )
    await db.commit()
    await db.refresh(room)
    result = await db.execute(select(RoomAssignment).where(RoomAssignment.room_id == room.id))
    occupied_count = len(result.scalars().all())
    return RoomOut(
        id=room.id, hotel_id=room.hotel_id, room_number=room.room_number,
        room_type_id=room.room_type_id, capacity=room.capacity, note=room.note, occupied=occupied_count,
    )


@router.delete("/hotels/{hotel_id}/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(event_id: int, hotel_id: int, room_id: int, db: DbSession, user: AdminUser) -> None:
    await _get_hotel_or_404(db, event_id, hotel_id)
    room = await master_data.get_or_404(db, Room, room_id)
    if room.hotel_id != hotel_id:
        raise AppError("not_found", "Room not found", status.HTTP_404_NOT_FOUND)
    result = await db.execute(select(RoomAssignment.id).where(RoomAssignment.room_id == room_id))
    if result.first() is not None:
        raise AppError(
            "room_in_use", "Không thể xoá: còn người đang ở phòng này", status.HTTP_409_CONFLICT
        )
    await db.delete(room)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="room", entity_id=room_id,
        event_id=event_id,
    )
    await db.commit()


@router.post("/hotels/{hotel_id}/rooms/import", response_model=ImportResultOut)
async def import_rooms(
    event_id: int, hotel_id: int, db: DbSession, user: AdminUser, file: UploadFile
) -> ImportResultOut:
    """room_number, capacity[, note] — small dataset, parsed synchronously."""
    await _get_hotel_or_404(db, event_id, hotel_id)
    content = await read_xlsx(file)
    workbook = load_xlsx(content)
    sheet = workbook.active
    rows_iter = sheet.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    headers = (
        [str(h).strip().lower() if h is not None else "" for h in header_row]
        if header_row
        else []
    )
    if "room_number" not in headers:
        raise AppError(
            "missing_headers", "File thiếu cột room_number", status.HTTP_400_BAD_REQUEST
        )

    ok_rows = 0
    errors: list[dict] = []
    for index, raw_row in enumerate(rows_iter, start=2):
        if raw_row is None or all(v is None for v in raw_row):
            continue
        row = {headers[i]: raw_row[i] for i in range(len(headers)) if headers[i]}
        try:
            async with db.begin_nested():
                room = Room(
                    hotel_id=hotel_id,
                    room_number=str(row["room_number"]).strip(),
                    capacity=int(row["capacity"]) if row.get("capacity") else 2,
                    note=str(row["note"]).strip() if row.get("note") else None,
                )
                db.add(room)
                await db.flush()
            ok_rows += 1
        except Exception as exc:  # noqa: BLE001
            errors.append({"row": index, "error": str(exc)})

    await db.commit()
    await record_audit(
        db, actor_user_id=user.id, action="import", entity_type="room", entity_id=hotel_id,
        after={"ok_rows": ok_rows, "error_rows": len(errors)}, event_id=event_id,
    )
    await db.commit()
    return ImportResultOut(ok_rows=ok_rows, error_rows=len(errors), errors=errors)


@router.get("/hotels/{hotel_id}/rooms/import-template")
async def download_rooms_template(
    event_id: int, hotel_id: int, db: DbSession, _user: AdminUser
) -> object:
    await _get_hotel_or_404(db, event_id, hotel_id)
    return xlsx_file(
        "Phong",
        ["room_number", "capacity", "note"],
        [["101", 2, "view bien"]],
        f"rooms_template_hotel_{hotel_id}.xlsx",
    )
