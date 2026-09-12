from collections import defaultdict

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.flight import Flight, FlightAssignment
from app.models.organization import Employee
from app.models.registration import Registration
from app.models.system import AllocationRun
from app.services.allocation.base import DEFAULT_WEIGHTS, Candidate, FlightSlot, TeamGroup
from app.services.allocation.greedy import GreedyFlightStrategy


async def run_flight_allocation(
    db: AsyncSession,
    event_id: int,
    direction: str,
    weights: dict[str, float] | None,
    allocation_run_id: int,
) -> dict:
    stored_weights = weights
    if not stored_weights:
        from app.services.event_service import get_setting

        raw = await get_setting(db, event_id, "flight_allocation_weights", {})
        stored_weights = raw if isinstance(raw, dict) else {}
    effective_weights = {**DEFAULT_WEIGHTS, **stored_weights}

    result = await db.execute(
        select(Registration.employee_id, Registration.shift_id, Employee.team_id)
        .join(Employee, Employee.id == Registration.employee_id)
        .where(
            Registration.event_id == event_id,
            Registration.status == "submitted",
            Registration.is_participating.is_(True),
        )
    )
    rows = result.all()

    result = await db.execute(
        select(FlightAssignment).where(
            FlightAssignment.event_id == event_id,
            FlightAssignment.direction == direction,
            FlightAssignment.is_locked.is_(True),
        )
    )
    locked = result.scalars().all()
    locked_employee_ids = {a.employee_id for a in locked}

    result = await db.execute(
        select(Flight).where(Flight.event_id == event_id, Flight.direction == direction)
    )
    slots = {
        f.id: FlightSlot(flight_id=f.id, shift_id=f.shift_id, capacity=f.capacity)
        for f in result.scalars().all()
    }
    for a in locked:
        if a.flight_id in slots:
            slots[a.flight_id].assigned.append(a.employee_id)

    by_team: dict[int | None, list[Candidate]] = defaultdict(list)
    for employee_id, shift_id, team_id in rows:
        if employee_id in locked_employee_ids:
            continue
        by_team[team_id].append(
            Candidate(employee_id=employee_id, team_id=team_id, shift_id=shift_id)
        )
    teams = [TeamGroup(team_id=tid, employees=emps) for tid, emps in by_team.items()]

    outcome = GreedyFlightStrategy().allocate(teams, list(slots.values()), effective_weights)

    await db.execute(
        delete(FlightAssignment).where(
            FlightAssignment.event_id == event_id,
            FlightAssignment.direction == direction,
            FlightAssignment.is_locked.is_(False),
        )
    )
    now = utcnow()
    for employee_id, flight_id in outcome.assignments.items():
        db.add(
            FlightAssignment(
                event_id=event_id,
                flight_id=flight_id,
                employee_id=employee_id,
                direction=direction,
                source="auto",
                is_flagged=employee_id in outcome.flagged,
                flag_reason=outcome.flagged.get(employee_id),
                assigned_at=now,
            )
        )
    # employees no flight had room for at all: still recorded (flight_id=None) so
    # BTC sees them in the assignments list instead of them silently vanishing
    for employee_id, reason in outcome.flagged.items():
        if employee_id not in outcome.assignments:
            db.add(
                FlightAssignment(
                    event_id=event_id,
                    flight_id=None,
                    employee_id=employee_id,
                    direction=direction,
                    source="auto",
                    is_flagged=True,
                    flag_reason=reason,
                    assigned_at=now,
                )
            )

    summary = {
        "total_submitted": len(rows),
        "total_assigned": len(outcome.assignments) + len(locked),
        "total_flagged": len(outcome.flagged),
        "split_team_ids": sorted(outcome.split_team_ids),
        "flights": [
            {
                "flight_id": fid,
                "capacity": slot.capacity,
                "assigned": len(slot.assigned),
                "remaining": slot.remaining,
            }
            for fid, slot in slots.items()
        ],
    }

    run = await db.get(AllocationRun, allocation_run_id)
    run.summary_json = summary
    run.status = "succeeded"
    await db.flush()
    return summary
