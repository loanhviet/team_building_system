"""services.allocation.bus_runner.run_bus_allocation end-to-end against a real
(in-memory) DB — test_bus_greedy.py covers the pure scoring/compatibility
logic; this pins persistence plus the "flight allocation must run first"
guard for a flight_timing leg."""

import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.core.time import utcnow
from app.models.bus import Bus, BusAssignment
from app.models.event import PickupPoint, TransportLeg
from app.models.flight import Flight, FlightAssignment
from app.models.registration import RegistrationTransportNeed
from app.models.system import AllocationRun
from app.services.leg_pickup import pickup_constraint


def test_workplace_pickup_does_not_block_a_hotel_leg() -> None:
    assert pickup_constraint("inbound", "before_flight", 7, "workplace") is None
    assert pickup_constraint("outbound", "before_flight", 7, "workplace") == 7
    assert pickup_constraint("inbound", "before_flight", 9, "venue") == 9
from app.services.allocation.bus_runner import run_bus_allocation


async def _needs_bus(db_session, world, leg, pickup_point_id=None):
    db_session.add(
        RegistrationTransportNeed(
            registration_id=world.registration.id, leg_id=leg.id, is_needed=True,
            pickup_point_id=pickup_point_id,
        )
    )


async def test_flight_timing_leg_requires_flight_allocation_first(db_session, world):
    leg = TransportLeg(
        event_id=world.event.id, code="HN_SB", name="Nhà → Sân bay", direction="outbound",
        flight_timing="before_flight",
    )
    db_session.add(leg)
    await db_session.flush()
    await _needs_bus(db_session, world, leg)
    await db_session.commit()

    run = AllocationRun(event_id=world.event.id, type="bus", status="running")
    db_session.add(run)
    await db_session.flush()

    with pytest.raises(AppError) as exc_info:
        await run_bus_allocation(db_session, world.event.id, leg.id, run.id)
    assert exc_info.value.code == "flight_allocation_required"


async def test_pickup_point_mismatch_flags_no_compatible_bus(db_session, world):
    leg = TransportLeg(
        event_id=world.event.id, code="HN_SB2", name="Nhà → Sân bay", direction="outbound",
    )
    point_a = PickupPoint(event_id=world.event.id, site_id=world.site.id, name="Điểm A")
    point_b = PickupPoint(event_id=world.event.id, site_id=world.site.id, name="Điểm B")
    db_session.add_all([leg, point_a, point_b])
    await db_session.flush()
    await _needs_bus(db_session, world, leg, pickup_point_id=point_a.id)
    bus = Bus(event_id=world.event.id, leg_id=leg.id, code="XE01", capacity=5, pickup_point_id=point_b.id)
    db_session.add(bus)
    await db_session.commit()

    run = AllocationRun(event_id=world.event.id, type="bus", status="running")
    db_session.add(run)
    await db_session.flush()

    summary = await run_bus_allocation(db_session, world.event.id, leg.id, run.id)
    await db_session.commit()

    assert summary["total_flagged"] == 1
    result = await db_session.execute(
        select(BusAssignment).where(BusAssignment.event_id == world.event.id)
    )
    assignment = result.scalars().first()
    assert assignment.flag_reason == "no_compatible_bus"


async def test_bus_timing_window_matches_flight(db_session, world):
    leg = TransportLeg(
        event_id=world.event.id, code="SB_KS2", name="Sân bay → Khách sạn", direction="outbound",
        flight_timing="after_flight",
    )
    db_session.add(leg)
    await db_session.flush()
    await _needs_bus(db_session, world, leg)
    flight = Flight(
        event_id=world.event.id, flight_code="VN900", direction="outbound",
        depart_at=utcnow().replace(hour=6, minute=0, second=0, microsecond=0),
        arrive_at=utcnow().replace(hour=7, minute=20, second=0, microsecond=0),
        capacity=5,
    )
    db_session.add(flight)
    await db_session.flush()
    db_session.add(
        FlightAssignment(
            event_id=world.event.id, flight_id=flight.id, employee_id=world.employee.id,
            direction="outbound", source="auto", assigned_at=utcnow(),
        )
    )
    # matches the after_flight window [arrive, arrive+3h]
    bus_ok = Bus(
        event_id=world.event.id, leg_id=leg.id, code="XE-OK", capacity=5,
        depart_at=flight.arrive_at.replace(minute=30),
    )
    db_session.add(bus_ok)
    await db_session.commit()

    run = AllocationRun(event_id=world.event.id, type="bus", status="running")
    db_session.add(run)
    await db_session.flush()

    summary = await run_bus_allocation(db_session, world.event.id, leg.id, run.id)

    assert summary["total_assigned"] == 1
    assert summary["total_flagged"] == 0


async def test_missing_pickup_is_flagged_instead_of_auto_assigned(db_session, world):
    leg = TransportLeg(
        event_id=world.event.id, code="HOME", name="Văn phòng → Sân bay", direction="outbound"
    )
    point = PickupPoint(event_id=world.event.id, site_id=world.site.id, name="Văn phòng")
    db_session.add_all([leg, point])
    await db_session.flush()
    await _needs_bus(db_session, world, leg, pickup_point_id=None)
    bus = Bus(
        event_id=world.event.id, leg_id=leg.id, code="XE-HOME", capacity=5,
        pickup_point_id=point.id,
    )
    run = AllocationRun(event_id=world.event.id, type="bus", status="running")
    db_session.add_all([bus, run])
    await db_session.commit()

    summary = await run_bus_allocation(db_session, world.event.id, leg.id, run.id)
    assert summary["total_assigned"] == 0
    assignment = (
        await db_session.execute(
            select(BusAssignment).where(BusAssignment.employee_id == world.employee.id)
        )
    ).scalar_one()
    assert assignment.bus_id is None
    assert assignment.flag_reason == "pickup_missing"
    assert summary["total_flagged"] == 1
