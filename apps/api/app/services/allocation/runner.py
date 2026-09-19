from collections import defaultdict

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.flight import Flight, FlightAssignment
from app.models.organization import Employee
from app.models.registration import Registration
from app.models.system import AllocationRun
from app.services.allocation.base import (
    DEFAULT_WEIGHTS,
    Candidate,
    FlightSlot,
    TeamGroup,
    merge_weights,
)
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
    effective_weights = merge_weights(stored_weights, DEFAULT_WEIGHTS)

    result = await db.execute(
        select(
            Registration.employee_id, Registration.shift_id, Employee.team_id, Employee.site_id
        )
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
    eligible_ids = {employee_id for employee_id, _shift_id, _team_id, _site_id in rows}
    locked = []
    for assignment in result.scalars().all():
        if assignment.employee_id in eligible_ids:
            locked.append(assignment)
        else:
            # Clean up assignments left by older registration flows too.
            await db.delete(assignment)
    locked_employee_ids = {a.employee_id for a in locked}

    result = await db.execute(
        select(Flight).where(Flight.event_id == event_id, Flight.direction == direction)
    )
    slots = {
        f.id: FlightSlot(flight_id=f.id, shift_id=f.shift_id, capacity=f.capacity, site_id=f.site_id)
        for f in result.scalars().all()
    }
    team_by_employee = {employee_id: team_id for employee_id, _shift_id, team_id, _site_id in rows}
    for a in locked:
        if a.flight_id in slots:
            slots[a.flight_id].assigned.append(a.employee_id)
            slots[a.flight_id].assigned_team_ids.append(team_by_employee.get(a.employee_id))

    # group by (team_id, site_id) — never treat a team spread across two
    # office sites as one group to "keep together"; that grouping is what let
    # HCM employees get greedily boarded onto HN-only flights (see runner
    # audit note in docs/REBUILD-PLAN.md §R7)
    by_team_site: dict[tuple[int | None, int | None], list[Candidate]] = defaultdict(list)
    for employee_id, shift_id, team_id, site_id in rows:
        if employee_id in locked_employee_ids:
            continue
        by_team_site[(team_id, site_id)].append(
            Candidate(employee_id=employee_id, team_id=team_id, shift_id=shift_id)
        )
    teams = [
        TeamGroup(team_id=tid, employees=emps, site_id=sid)
        for (tid, sid), emps in by_team_site.items()
    ]

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

    flights_by_team: dict[int, set[int]] = defaultdict(set)
    for employee_id, flight_id in outcome.assignments.items():
        team_id = team_by_employee.get(employee_id)
        if team_id is not None:
            flights_by_team[team_id].add(flight_id)
    for assignment in locked:
        team_id = team_by_employee.get(assignment.employee_id)
        if team_id is not None and assignment.flight_id is not None:
            flights_by_team[team_id].add(assignment.flight_id)

    summary = {
        "total_submitted": len(rows),
        "total_assigned": len(outcome.assignments) + len(locked),
        "total_flagged": len(outcome.flagged) + sum(1 for a in locked if a.is_flagged),
        "split_team_ids": sorted(tid for tid, used in flights_by_team.items() if len(used) > 1),
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
