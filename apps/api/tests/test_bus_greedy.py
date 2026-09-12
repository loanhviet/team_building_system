from app.services.allocation.bus_greedy import BusCandidate, BusSlot, allocate_buses


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
