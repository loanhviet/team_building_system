from datetime import date, datetime

from app.services.allocation.bus_greedy import BusCandidate, BusSlot, allocate_buses, bus_compatible

DAY = datetime.combine(date(2026, 12, 20), datetime.min.time())


def test_same_team_grouped_together_when_it_fits():
    candidates = [BusCandidate(employee_id=i, team_id=1, flight_id=None) for i in range(4)]
    buses = [BusSlot(bus_id=1, capacity=10)]

    result = allocate_buses(candidates, buses)

    assert len(result.assignments) == 4
    assert set(result.assignments.values()) == {1}


def test_prefers_bus_already_carrying_same_flight():
    # Bus 1 already has someone from flight 99 (simulating a locked
    # assignment); a new candidate sharing that flight should join bus 1
    # over an equally-empty bus 2.
    bus1 = BusSlot(bus_id=1, capacity=5, assigned=[555], flight_ids_present={99})
    bus2 = BusSlot(bus_id=2, capacity=5)

    candidates = [BusCandidate(employee_id=1, team_id=1, flight_id=99)]
    result = allocate_buses(candidates, [bus1, bus2])

    assert result.assignments[1] == 1


def test_overflow_candidates_are_flagged_no_slot():
    candidates = [BusCandidate(employee_id=i, team_id=1, flight_id=None) for i in range(5)]
    buses = [BusSlot(bus_id=1, capacity=3)]

    result = allocate_buses(candidates, buses)

    assert len(result.assignments) == 3
    assert len(result.flagged) == 2
    assert all(reason == "no_slot" for reason in result.flagged.values())


def test_capacity_never_exceeded_across_multiple_teams():
    candidates = [BusCandidate(employee_id=i, team_id=1, flight_id=None) for i in range(3)]
    candidates += [BusCandidate(employee_id=100 + i, team_id=2, flight_id=None) for i in range(3)]
    buses = [BusSlot(bus_id=1, capacity=4)]

    result = allocate_buses(candidates, buses)

    assert len(result.assignments) == 4
    assert len(result.flagged) == 2


def test_pickup_point_mismatch_flags_no_compatible_bus():
    # Only bus has pickup point A; candidate registered for pickup point B —
    # audit found this ignored entirely (57+62 people seated on the wrong
    # pickup point in real seed data).
    candidates = [BusCandidate(employee_id=1, team_id=1, flight_id=None, pickup_point_id=2)]
    buses = [BusSlot(bus_id=1, capacity=5, pickup_point_id=1)]

    result = allocate_buses(candidates, buses)

    assert not result.assignments
    assert result.flagged[1] == "no_compatible_bus"


def test_pickup_point_match_succeeds():
    candidates = [BusCandidate(employee_id=1, team_id=1, flight_id=None, pickup_point_id=1)]
    buses = [BusSlot(bus_id=1, capacity=5, pickup_point_id=1)]

    result = allocate_buses(candidates, buses)

    assert result.assignments[1] == 1


def test_bus_before_flight_too_early_is_incompatible():
    flight_depart = DAY.replace(hour=8, minute=5)
    candidates = [
        BusCandidate(employee_id=1, team_id=1, flight_id=10, flight_depart_at=flight_depart)
    ]
    # bus leaves 7h before departure — outside the 6h lead window
    buses = [BusSlot(bus_id=1, capacity=5, depart_at=DAY.replace(hour=1, minute=5))]

    result = allocate_buses(candidates, buses, flight_timing="before_flight")

    assert not result.assignments
    assert result.flagged[1] == "no_compatible_bus"


def test_bus_after_flight_landing_matches_window():
    flight_arrive = DAY.replace(hour=7, minute=20)
    candidates = [
        BusCandidate(employee_id=1, team_id=1, flight_id=10, flight_arrive_at=flight_arrive)
    ]
    buses = [BusSlot(bus_id=1, capacity=5, depart_at=DAY.replace(hour=7, minute=30))]

    result = allocate_buses(candidates, buses, flight_timing="after_flight")

    assert result.assignments[1] == 1


def test_bus_compatible_permissive_on_missing_data():
    # no bus depart_at set, or no flight time known yet — never blocks on
    # incomplete data, only rejects a *known* mismatch
    assert bus_compatible(1, None, 1, None, None, "before_flight")
    assert bus_compatible(1, DAY.replace(hour=8), 1, None, None, "before_flight")
    # leg has no flight relationship at all (flight_timing=None) — never
    # blocked on timing regardless of what the raw times would say
    assert bus_compatible(None, DAY.replace(hour=8), 1, DAY.replace(hour=9), None, None)
