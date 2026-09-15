from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bus import Bus, BusAssignment
from app.models.flight import Flight, FlightAssignment
from app.models.hotel import Hotel, Room, RoomAssignment
from app.models.organization import Employee
from app.models.registration import Registration, RegistrationTransportNeed


async def build_publish_readiness(db: AsyncSession, event_id: int) -> dict:
    blockers: list[dict] = []
    warnings: list[dict] = []

    flight_loads = (
        await db.execute(
            select(Flight.flight_code, Flight.capacity, func.count(FlightAssignment.id))
            .outerjoin(FlightAssignment, FlightAssignment.flight_id == Flight.id)
            .where(Flight.event_id == event_id)
            .group_by(Flight.id)
        )
    ).all()
    for code, capacity, assigned in flight_loads:
        if assigned > capacity:
            blockers.append({"code": "flight_over_capacity", "message": f"Chuyến {code} vượt {assigned - capacity} chỗ"})

    bus_loads = (
        await db.execute(
            select(Bus.code, Bus.capacity, func.count(BusAssignment.id))
            .outerjoin(BusAssignment, BusAssignment.bus_id == Bus.id)
            .where(Bus.event_id == event_id)
            .group_by(Bus.id)
        )
    ).all()
    for code, capacity, assigned in bus_loads:
        if assigned > capacity:
            blockers.append({"code": "bus_over_capacity", "message": f"Xe {code} vượt {assigned - capacity} chỗ"})

    room_loads = (
        await db.execute(
            select(
                Hotel.code,
                Room.room_number,
                Room.capacity,
                func.count(RoomAssignment.id),
            )
            .join(Hotel, Hotel.id == Room.hotel_id)
            .outerjoin(RoomAssignment, RoomAssignment.room_id == Room.id)
            .where(Hotel.event_id == event_id)
            .group_by(Room.id)
        )
    ).all()
    for hotel_code, number, capacity, assigned in room_loads:
        if assigned > capacity:
            blockers.append({
                "code": "room_over_capacity",
                "message": f"Phòng {hotel_code}/{number} vượt {assigned - capacity} chỗ",
            })

    site_mismatches = (
        await db.execute(
            select(func.count(FlightAssignment.id))
            .join(Flight, Flight.id == FlightAssignment.flight_id)
            .join(Employee, Employee.id == FlightAssignment.employee_id)
            .where(
                FlightAssignment.event_id == event_id,
                Flight.site_id.is_not(None),
                Employee.site_id.is_not(None),
                Flight.site_id != Employee.site_id,
            )
        )
    ).scalar_one()
    if site_mismatches:
        blockers.append({"code": "flight_site_mismatch", "message": f"Có {site_mismatches} người đang ở chuyến sai site"})

    participant_count = (
        await db.execute(
            select(func.count(Registration.id)).where(
                Registration.event_id == event_id,
                Registration.status == "submitted",
                Registration.is_participating.is_(True),
            )
        )
    ).scalar_one()
    room_assigned = (
        await db.execute(select(func.count(RoomAssignment.id)).where(RoomAssignment.event_id == event_id))
    ).scalar_one()
    if room_assigned < participant_count:
        warnings.append({"code": "room_unassigned", "message": f"Còn {participant_count - room_assigned} người chưa có phòng"})

    for direction, label in (("outbound", "chiều đi"), ("inbound", "chiều về")):
        has_resources = (
            await db.execute(select(func.count(Flight.id)).where(Flight.event_id == event_id, Flight.direction == direction))
        ).scalar_one()
        assigned = (
            await db.execute(select(func.count(FlightAssignment.id)).where(
                FlightAssignment.event_id == event_id,
                FlightAssignment.direction == direction,
                FlightAssignment.flight_id.is_not(None),
            ))
        ).scalar_one()
        if has_resources and assigned < participant_count:
            warnings.append({"code": f"flight_{direction}_unassigned", "message": f"Còn {participant_count - assigned} người chưa có chuyến {label}"})

    needed = (
        await db.execute(
            select(func.count(RegistrationTransportNeed.id))
            .join(Registration, Registration.id == RegistrationTransportNeed.registration_id)
            .where(
                Registration.event_id == event_id,
                Registration.status == "submitted",
                Registration.is_participating.is_(True),
                RegistrationTransportNeed.is_needed.is_(True),
            )
        )
    ).scalar_one()
    bus_assigned = (
        await db.execute(select(func.count(BusAssignment.id)).where(
            BusAssignment.event_id == event_id, BusAssignment.bus_id.is_not(None)
        ))
    ).scalar_one()
    if bus_assigned < needed:
        warnings.append({"code": "bus_unassigned", "message": f"Còn {needed - bus_assigned} lượt xe chưa được phân"})

    soft_flags = (
        await db.execute(select(func.count(FlightAssignment.id)).where(
            FlightAssignment.event_id == event_id, FlightAssignment.is_flagged.is_(True)
        ))
    ).scalar_one() + (
        await db.execute(select(func.count(BusAssignment.id)).where(
            BusAssignment.event_id == event_id, BusAssignment.is_flagged.is_(True)
        ))
    ).scalar_one()
    if soft_flags:
        warnings.append({"code": "soft_flags", "message": f"Có {soft_flags} cảnh báo phân bổ mềm"})

    timing_mismatches = (
        await db.execute(select(func.count(BusAssignment.id)).where(
            BusAssignment.event_id == event_id,
            BusAssignment.flag_reason == "flight_timing_mismatch",
        ))
    ).scalar_one()
    if timing_mismatches:
        blockers.append({
            "code": "bus_timing_mismatch",
            "message": f"Có {timing_mismatches} phân bổ xe không còn khớp giờ bay",
        })

    return {
        "ready": not blockers,
        "requires_confirmation": bool(warnings),
        "blockers": blockers,
        "warnings": warnings,
    }
