"""services.allocation.runner.run_flight_allocation end-to-end against a real
(in-memory) DB — test_allocation_greedy.py already covers the pure scoring
logic; this pins the persistence side: AllocationRun.summary_json shape and
FlightAssignment rows actually matching each flight's capacity."""

from sqlalchemy import select

from app.core.time import utcnow
from app.models.flight import Flight, FlightAssignment
from app.models.registration import Registration
from app.models.system import AllocationRun
from app.services.allocation.runner import run_flight_allocation
from tests.conftest import make_employee


async def test_run_flight_allocation_persists_summary_and_assignments(db_session, world):
    # world already has 1 submitted+participating registration on world.team/world.shift
    for code in ("NV002", "NV003"):
        person = await make_employee(db_session, team=world.team, site=world.site, code=code)
        db_session.add(
            Registration(
                event_id=world.event.id, employee_id=person.employee.id, status="submitted",
                is_participating=True, shift_id=world.shift.id, agreed_terms_at=utcnow(),
                terms_version="v1", submitted_at=utcnow(),
            )
        )
    flight = Flight(event_id=world.event.id, flight_code="VN001", direction="outbound", capacity=2)
    db_session.add(flight)
    await db_session.flush()

    run = AllocationRun(event_id=world.event.id, type="flight", status="running")
    db_session.add(run)
    await db_session.flush()

    summary = await run_flight_allocation(db_session, world.event.id, "outbound", None, run.id)
    await db_session.commit()

    # 3 people, one team, one flight with room for 2 — one is left over
    assert summary["total_submitted"] == 3
    assert summary["total_assigned"] == 2
    assert summary["total_flagged"] == 1
    assert summary["flights"] == [
        {"flight_id": flight.id, "capacity": 2, "assigned": 2, "remaining": 0}
    ]

    result = await db_session.execute(
        select(FlightAssignment).where(FlightAssignment.event_id == world.event.id)
    )
    assignments = result.scalars().all()
    assert len(assignments) == 3
    on_flight = [a for a in assignments if a.flight_id == flight.id]
    assert len(on_flight) == 2
    flagged = [a for a in assignments if a.is_flagged]
    assert len(flagged) == 1
    assert flagged[0].flag_reason == "no_slot"
    assert flagged[0].flight_id is None

    await db_session.refresh(run)
    assert run.status == "succeeded"
    assert run.summary_json == summary
