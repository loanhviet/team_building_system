from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.bus import Bus, BusAssignment
from app.models.event import TransportLeg
from app.models.flight import FlightAssignment
from app.models.organization import Employee
from app.models.registration import Registration, RegistrationTransportNeed
from app.models.system import AllocationRun
from app.services.allocation.base import DEFAULT_BUS_WEIGHTS, merge_weights
from app.services.allocation.bus_greedy import BusCandidate, BusSlot, allocate_buses


async def run_bus_allocation(
    db: AsyncSession, event_id: int, leg_id: int, allocation_run_id: int
) -> dict:
    leg = await db.get(TransportLeg, leg_id)

    result = await db.execute(
        select(Employee.id, Employee.team_id)
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

    flight_by_employee: dict[int, int] = {}
    if leg is not None and leg.direction in ("outbound", "inbound"):
        fresult = await db.execute(
            select(FlightAssignment.employee_id, FlightAssignment.flight_id).where(
                FlightAssignment.event_id == event_id,
                FlightAssignment.direction == leg.direction,
                FlightAssignment.flight_id.is_not(None),
            )
        )
        flight_by_employee = dict(fresult.all())

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
    team_by_employee = {eid: tid for eid, tid in rows}
    slots = {b.id: BusSlot(bus_id=b.id, capacity=b.capacity) for b in result.scalars().all()}
    for a in locked:
        if a.bus_id in slots:
            slots[a.bus_id].assigned.append(a.employee_id)
            slots[a.bus_id].assigned_team_ids.append(team_by_employee.get(a.employee_id))
            fid = flight_by_employee.get(a.employee_id)
            if fid is not None:
                slots[a.bus_id].flight_ids_present.add(fid)

    candidates = [
        BusCandidate(employee_id=eid, team_id=tid, flight_id=flight_by_employee.get(eid))
        for eid, tid in rows
        if eid not in locked_employee_ids
    ]

    from app.services.event_service import get_setting

    raw = await get_setting(db, event_id, "bus_allocation_weights", {})
    weights = merge_weights(raw if isinstance(raw, dict) else {}, DEFAULT_BUS_WEIGHTS)
    outcome = allocate_buses(candidates, list(slots.values()), weights)

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
