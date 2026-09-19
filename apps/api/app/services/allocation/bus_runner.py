from fastapi import status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.time import utcnow
from app.models.bus import Bus, BusAssignment
from app.models.event import TransportLeg
from app.models.flight import Flight, FlightAssignment
from app.models.organization import Employee
from app.models.registration import Registration, RegistrationTransportNeed
from app.models.system import AllocationRun
from app.services.allocation.base import DEFAULT_BUS_WEIGHTS, merge_weights
from app.services.allocation.bus_greedy import BusCandidate, BusSlot, allocate_buses


async def run_bus_allocation(
    db: AsyncSession,
    event_id: int,
    leg_id: int,
    allocation_run_id: int,
    requested_weights: dict[str, float] | None = None,
) -> dict:
    leg = await db.get(TransportLeg, leg_id)

    result = await db.execute(
        select(
            Employee.id, Employee.team_id, RegistrationTransportNeed.pickup_point_id
        )
        .join(Registration, Registration.employee_id == Employee.id)
        .join(
            RegistrationTransportNeed,
            (RegistrationTransportNeed.registration_id == Registration.id)
            & (RegistrationTransportNeed.leg_id == leg_id),
        )
        .where(
            Registration.event_id == event_id,
            Registration.status == "submitted",
            Registration.is_participating.is_(True),
            RegistrationTransportNeed.is_needed.is_(True),
        )
    )
    rows = result.all()

    flight_by_employee: dict[int, tuple[int, object, object]] = {}
    if leg is not None and leg.direction in ("outbound", "inbound"):
        fresult = await db.execute(
            select(
                FlightAssignment.employee_id, Flight.id, Flight.depart_at, Flight.arrive_at
            )
            .join(Flight, Flight.id == FlightAssignment.flight_id)
            .where(
                FlightAssignment.event_id == event_id,
                FlightAssignment.direction == leg.direction,
                FlightAssignment.flight_id.is_not(None),
            )
        )
        flight_by_employee = {
            eid: (fid, depart_at, arrive_at) for eid, fid, depart_at, arrive_at in fresult.all()
        }

    # a leg that's supposed to feed/follow a specific flight can't be sanely
    # allocated before that flight's own allocation has run — every bus would
    # just fall through as "no flight timing to compare against"
    if leg is not None and leg.flight_timing and rows and not flight_by_employee:
        raise AppError(
            "flight_allocation_required",
            f"Chặng '{leg.name}' cần đối chiếu giờ bay — hãy chạy phân bổ chuyến bay chiều "
            f"{leg.direction} trước.",
            status.HTTP_400_BAD_REQUEST,
        )

    result = await db.execute(
        select(BusAssignment).where(
            BusAssignment.event_id == event_id,
            BusAssignment.leg_id == leg_id,
            BusAssignment.is_locked.is_(True),
        )
    )
    locked = result.scalars().all()
    locked_employee_ids = {a.employee_id for a in locked}

    result = await db.execute(
        select(Bus).where(Bus.event_id == event_id, Bus.leg_id == leg_id)
    )
    team_by_employee = {eid: tid for eid, tid, _pp in rows}
    slots = {
        b.id: BusSlot(
            bus_id=b.id, capacity=b.capacity, pickup_point_id=b.pickup_point_id, depart_at=b.depart_at
        )
        for b in result.scalars().all()
    }
    for a in locked:
        if a.bus_id in slots:
            slots[a.bus_id].assigned.append(a.employee_id)
            slots[a.bus_id].assigned_team_ids.append(team_by_employee.get(a.employee_id))
            fid = flight_by_employee.get(a.employee_id, (None, None, None))[0]
            if fid is not None:
                slots[a.bus_id].flight_ids_present.add(fid)

    # Only home-pickup legs require a point. Destination legs (airport →
    # hotel, hotel → airport) intentionally have buses without pickup points.
    requires_pickup = any(slot.pickup_point_id is not None for slot in slots.values())
    # A missing required pickup is not a wildcard. Keep the person visible as
    # a flagged unassigned row so BTC can follow up instead of silently placing
    # them on an arbitrary bus.
    missing_pickup_ids = {
        eid for eid, _tid, pickup_point_id in rows if requires_pickup and pickup_point_id is None
    }
    candidates = [
        BusCandidate(
            employee_id=eid, team_id=tid, pickup_point_id=pickup_point_id,
            flight_id=flight_by_employee.get(eid, (None, None, None))[0],
            flight_depart_at=flight_by_employee.get(eid, (None, None, None))[1],
            flight_arrive_at=flight_by_employee.get(eid, (None, None, None))[2],
        )
        for eid, tid, pickup_point_id in rows
        if eid not in locked_employee_ids and (pickup_point_id is not None or not requires_pickup)
    ]

    from app.services.event_service import get_setting

    raw = requested_weights or await get_setting(db, event_id, "bus_allocation_weights", {})
    weights = merge_weights(raw if isinstance(raw, dict) else {}, DEFAULT_BUS_WEIGHTS)
    flight_timing = leg.flight_timing if leg is not None else None
    outcome = allocate_buses(candidates, list(slots.values()), weights, flight_timing)
    outcome.flagged.update({employee_id: "pickup_missing" for employee_id in missing_pickup_ids})

    await db.execute(
        delete(BusAssignment).where(
            BusAssignment.event_id == event_id,
            BusAssignment.leg_id == leg_id,
            BusAssignment.is_locked.is_(False),
        )
    )
    now = utcnow()
    for employee_id, bus_id in outcome.assignments.items():
        db.add(
            BusAssignment(
                event_id=event_id, leg_id=leg_id, bus_id=bus_id, employee_id=employee_id,
                source="auto", is_flagged=employee_id in outcome.flagged,
                flag_reason=outcome.flagged.get(employee_id), assigned_at=now,
            )
        )
    for employee_id, reason in outcome.flagged.items():
        if employee_id not in outcome.assignments:
            db.add(
                BusAssignment(
                    event_id=event_id, leg_id=leg_id, bus_id=None, employee_id=employee_id,
                    source="auto", is_flagged=True, flag_reason=reason, assigned_at=now,
                )
            )

    summary = {
        "total_needed": len(rows),
        "total_assigned": len(outcome.assignments) + len(locked),
        "total_flagged": len(outcome.flagged),
        "buses": [
            {"bus_id": bid, "capacity": s.capacity, "assigned": len(s.assigned), "remaining": s.remaining}
            for bid, s in slots.items()
        ],
    }

    run = await db.get(AllocationRun, allocation_run_id)
    run.summary_json = summary
    run.status = "succeeded"
    await db.flush()
    return summary
