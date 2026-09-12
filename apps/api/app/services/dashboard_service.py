from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bus import Bus, BusAssignment
from app.models.event import Shift, TransportLeg
from app.models.flight import Flight, FlightAssignment
from app.models.hotel import Hotel, Room, RoomAssignment
from app.models.organization import Employee
from app.models.registration import Registration, RegistrationTransportNeed
from app.schemas.dashboard import (
    BusLegStatus,
    DashboardOut,
    FlightSlotStatus,
    LegTransportCount,
    ShiftCount,
)


async def build_dashboard(db: AsyncSession, event_id: int) -> DashboardOut:
    total_employees = (
        await db.execute(select(func.count(Employee.id)).where(Employee.is_active.is_(True)))
    ).scalar_one()

    result = await db.execute(
        select(Registration.status, Registration.is_participating).where(
            Registration.event_id == event_id
        )
    )
    rows = result.all()
    registered_count = sum(1 for status, _ in rows if status == "submitted")
    participating_count = sum(
        1 for status, participating in rows if status == "submitted" and participating is True
    )
    not_participating_count = sum(
        1 for status, participating in rows if status == "submitted" and participating is False
    )

    result = await db.execute(
        select(Shift.name, func.count(Registration.id))
        .join(Registration, Registration.shift_id == Shift.id)
        .where(
            Registration.event_id == event_id, Registration.status == "submitted",
            Registration.is_participating.is_(True),
        )
        .group_by(Shift.id)
    )
    by_shift = [ShiftCount(shift_name=name, count=count) for name, count in result.all()]

    result = await db.execute(
        select(TransportLeg.id, TransportLeg.name)
        .where(TransportLeg.event_id == event_id, TransportLeg.is_active.is_(True))
        .order_by(TransportLeg.sort_order)
    )
    legs = result.all()

    result = await db.execute(
        select(RegistrationTransportNeed.leg_id, func.count(RegistrationTransportNeed.id))
        .join(Registration, Registration.id == RegistrationTransportNeed.registration_id)
        .where(
            Registration.event_id == event_id, RegistrationTransportNeed.is_needed.is_(True)
        )
        .group_by(RegistrationTransportNeed.leg_id)
    )
    needed_by_leg = dict(result.all())
    transport_need_by_leg = [
        LegTransportCount(leg_name=name, count=needed_by_leg.get(leg_id, 0)) for leg_id, name in legs
    ]

    result = await db.execute(select(Flight).where(Flight.event_id == event_id))
    flights = result.scalars().all()
    result = await db.execute(
        select(FlightAssignment.flight_id, func.count(FlightAssignment.id))
        .where(FlightAssignment.event_id == event_id, FlightAssignment.flight_id.is_not(None))
        .group_by(FlightAssignment.flight_id)
    )
    assigned_by_flight = dict(result.all())
    flight_slots = [
        FlightSlotStatus(
            flight_code=f.flight_code, direction=f.direction, capacity=f.capacity,
            assigned=assigned_by_flight.get(f.id, 0),
        )
        for f in flights
    ]
    flights_flagged_count = (
        await db.execute(
            select(func.count(FlightAssignment.id)).where(
                FlightAssignment.event_id == event_id, FlightAssignment.is_flagged.is_(True)
            )
        )
    ).scalar_one()

    rooms_assigned = (
        await db.execute(
            select(func.count(RoomAssignment.id)).where(RoomAssignment.event_id == event_id)
        )
    ).scalar_one()
    rooms_total_capacity = (
        await db.execute(
            select(func.coalesce(func.sum(Room.capacity), 0))
            .join(Hotel, Hotel.id == Room.hotel_id)
            .where(Hotel.event_id == event_id)
        )
    ).scalar_one()

    result = await db.execute(
        select(BusAssignment.leg_id, func.count(BusAssignment.id))
        .where(BusAssignment.event_id == event_id, BusAssignment.bus_id.is_not(None))
        .group_by(BusAssignment.leg_id)
    )
    assigned_by_leg = dict(result.all())
    buses_by_leg = [
        BusLegStatus(leg_name=name, needed=needed_by_leg.get(leg_id, 0), assigned=assigned_by_leg.get(leg_id, 0))
        for leg_id, name in legs
    ]
    buses_flagged_count = (
        await db.execute(
            select(func.count(BusAssignment.id)).where(
                BusAssignment.event_id == event_id, BusAssignment.is_flagged.is_(True)
            )
        )
    ).scalar_one()
    buses_without_leader_count = (
        await db.execute(
            select(func.count(Bus.id)).where(
                Bus.event_id == event_id, Bus.leader_name.is_(None)
            )
        )
    ).scalar_one()

    return DashboardOut(
        total_employees=total_employees,
        registered_count=registered_count,
        not_registered_count=max(total_employees - registered_count, 0),
        participating_count=participating_count,
        not_participating_count=not_participating_count,
        by_shift=by_shift,
        transport_need_by_leg=transport_need_by_leg,
        flight_slots=flight_slots,
        flights_flagged_count=flights_flagged_count,
        rooms_assigned=rooms_assigned,
        rooms_total_capacity=rooms_total_capacity,
        buses_by_leg=buses_by_leg,
        buses_flagged_count=buses_flagged_count,
        buses_without_leader_count=buses_without_leader_count,
    )
