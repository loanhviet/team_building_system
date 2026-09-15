from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.bus import Bus, BusAssignment
from app.models.event import Event, PickupPoint, TransportLeg
from app.models.flight import Flight, FlightAssignment
from app.models.gala import GalaConfig, GalaSeat, GalaTable
from app.models.hotel import Hotel, Room, RoomAssignment
from app.models.organization import Employee
from app.models.registration import Registration
from app.models.schedule import Announcement, ScheduleItem
from app.schemas.journey import (
    JourneyAnnouncement,
    JourneyBus,
    JourneyFlight,
    JourneyGala,
    JourneyGalaSeat,
    JourneyGalaTable,
    JourneyOut,
    JourneyRoom,
    JourneyScheduleItem,
)

PUBLISHED_STATUSES = ("information_published", "event_started", "event_completed")


async def resolve_published_event(
    db: AsyncSession, employee_id: int, event_id: int | None = None
) -> Event:
    stmt = (
        select(Event)
        .join(Registration, Registration.event_id == Event.id)
        .where(
            Registration.employee_id == employee_id,
            Registration.status == "submitted",
            Registration.is_participating.is_(True),
            Event.status.in_(PUBLISHED_STATUSES),
        )
    )
    if event_id is not None:
        stmt = stmt.where(Event.id == event_id)
    else:
        stmt = stmt.order_by(Event.published_at.desc().nulls_last(), Event.id.desc()).limit(1)
    result = await db.execute(stmt)
    event = result.scalar_one_or_none()
    if event is None:
        raise AppError(
            "no_published_event",
            "Chưa có hành trình nào được công bố cho bạn",
            status.HTTP_404_NOT_FOUND,
        )
    return event


async def build_journey(db: AsyncSession, event: Event, employee: Employee) -> JourneyOut:
    flights: list[JourneyFlight] = []
    result = await db.execute(
        select(FlightAssignment, Flight)
        .join(Flight, Flight.id == FlightAssignment.flight_id)
        .where(FlightAssignment.event_id == event.id, FlightAssignment.employee_id == employee.id)
    )
    for _assignment, flight in result.all():
        flights.append(
            JourneyFlight(
                direction=flight.direction, flight_code=flight.flight_code,
                airline=flight.airline,
                depart_at=flight.depart_at, arrive_at=flight.arrive_at,
                origin=flight.origin, destination=flight.destination,
            )
        )

    buses: list[JourneyBus] = []
    result = await db.execute(
        select(BusAssignment, Bus, TransportLeg, PickupPoint)
        .join(Bus, Bus.id == BusAssignment.bus_id)
        .join(TransportLeg, TransportLeg.id == BusAssignment.leg_id)
        .outerjoin(PickupPoint, PickupPoint.id == Bus.pickup_point_id)
        .where(BusAssignment.event_id == event.id, BusAssignment.employee_id == employee.id)
    )
    for _assignment, bus, leg, pickup in result.all():
        buses.append(
            JourneyBus(
                leg_name=leg.name, bus_code=bus.code, bus_name=bus.name,
                gather_at=bus.gather_at, depart_at=bus.depart_at,
                destination=bus.destination,
                pickup_name=pickup.name if pickup else None,
                pickup_address=pickup.address if pickup else None,
                leader_name=bus.leader_name, leader_phone=bus.leader_phone,
                note=bus.note,
            )
        )

    room: JourneyRoom | None = None
    result = await db.execute(
        select(RoomAssignment, Room, Hotel)
        .join(Room, Room.id == RoomAssignment.room_id)
        .join(Hotel, Hotel.id == Room.hotel_id)
        .where(RoomAssignment.event_id == event.id, RoomAssignment.employee_id == employee.id)
    )
    row = result.first()
    if row is not None:
        _assignment, room_row, hotel = row
        room = JourneyRoom(
            hotel_name=hotel.name,
            hotel_address=hotel.address,
            room_number=room_row.room_number,
            checkin_date=hotel.checkin_date,
            checkout_date=hotel.checkout_date,
        )

    gala: JourneyGala | None = None
    result = await db.execute(select(GalaConfig).where(GalaConfig.event_id == event.id))
    gala_config = result.scalar_one_or_none()
    if gala_config is not None:
        tables_out: list[JourneyGalaTable] = []
        if employee.team_id is not None:
            result = await db.execute(
                select(GalaSeat, GalaTable)
                .join(GalaTable, GalaTable.id == GalaSeat.table_id)
                .where(
                    GalaTable.event_id == event.id,
                    GalaSeat.team_id == employee.team_id,
                    GalaSeat.status == "confirmed",
                )
                .order_by(GalaTable.code, GalaSeat.seat_number)
            )
            by_table: dict[int, JourneyGalaTable] = {}
            for seat, table in result.all():
                entry = by_table.get(table.id)
                if entry is None:
                    entry = JourneyGalaTable(
                        table_code=table.code, table_name=table.name, seats=[]
                    )
                    by_table[table.id] = entry
                entry.seats.append(
                    JourneyGalaSeat(seat_number=seat.seat_number, label=seat.label)
                )
            tables_out = list(by_table.values())
        gala = JourneyGala(status=gala_config.status, name=gala_config.name, tables=tables_out)

    result = await db.execute(
        select(Registration).where(
            Registration.event_id == event.id, Registration.employee_id == employee.id
        )
    )
    registration = result.scalar_one_or_none()

    schedule: list[JourneyScheduleItem] = []
    result = await db.execute(
        select(ScheduleItem)
        .where(ScheduleItem.event_id == event.id, ScheduleItem.is_published.is_(True))
        .order_by(ScheduleItem.sort_order)
    )
    for item in result.scalars().all():
        if item.audience == "team" and item.audience_ref_id != employee.team_id:
            continue
        if item.audience == "shift" and (
            registration is None or item.audience_ref_id != registration.shift_id
        ):
            continue
        schedule.append(
            JourneyScheduleItem(
                day_date=item.day_date.isoformat() if item.day_date else None,
                start_at=item.start_at, end_at=item.end_at, title=item.title,
                location=item.location,
            )
        )

    announcements: list[JourneyAnnouncement] = []
    result = await db.execute(
        select(Announcement)
        .where(Announcement.event_id == event.id, Announcement.published_at.is_not(None))
        .order_by(Announcement.is_pinned.desc(), Announcement.published_at.desc())
        .limit(10)
    )
    for a in result.scalars().all():
        announcements.append(
            JourneyAnnouncement(
                id=a.id,
                title=a.title,
                body_md=a.body_md,
                is_pinned=a.is_pinned,
                published_at=a.published_at,
            )
        )

    return JourneyOut(
        event_id=event.id,
        event_name=event.name,
        event_status=event.status.value,
        destination=event.destination,
        start_date=event.start_date,
        end_date=event.end_date,
        full_name=employee.full_name,
        employee_code=employee.employee_code,
        team_name=employee.team.name if employee.team else None,
        site_name=employee.site.name if employee.site else None,
        phone=employee.phone,
        is_participating=registration.is_participating if registration else None,
        flights=flights,
        buses=buses,
        room=room,
        gala=gala,
        schedule=schedule,
        announcements=announcements,
    )
