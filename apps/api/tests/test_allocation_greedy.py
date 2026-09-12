from app.services.allocation.base import DEFAULT_WEIGHTS, Candidate, FlightSlot, TeamGroup
from app.services.allocation.greedy import GreedyFlightStrategy


def make_team(team_id: int, size: int, shift_id: int = 1) -> TeamGroup:
    return TeamGroup(
        team_id=team_id,
        employees=[
            Candidate(employee_id=team_id * 100 + i, team_id=team_id, shift_id=shift_id)
            for i in range(size)
        ],
    )


def test_whole_team_fits_one_flight():
    teams = [make_team(1, 3)]
    flights = [FlightSlot(flight_id=10, shift_id=1, capacity=6)]

    result = GreedyFlightStrategy().allocate(teams, flights, DEFAULT_WEIGHTS)

    assert len(result.assignments) == 3
    assert all(flight_id == 10 for flight_id in result.assignments.values())
    assert not result.flagged
    assert not result.split_team_ids


def test_team_split_when_no_single_flight_fits():
    # Team of 5, but no flight has room for all 5 at once.
    teams = [make_team(1, 5)]
    flights = [
        FlightSlot(flight_id=10, shift_id=1, capacity=3),
        FlightSlot(flight_id=11, shift_id=1, capacity=3),
    ]

    result = GreedyFlightStrategy().allocate(teams, flights, DEFAULT_WEIGHTS)

    assert len(result.assignments) == 5
    assert result.split_team_ids == {1}
    used_flights = set(result.assignments.values())
    assert used_flights == {10, 11}


def test_unplaceable_candidates_are_flagged_no_slot():
    teams = [make_team(1, 4)]
    flights = [FlightSlot(flight_id=10, shift_id=1, capacity=2)]

    result = GreedyFlightStrategy().allocate(teams, flights, DEFAULT_WEIGHTS)

    assert len(result.assignments) == 2
    unplaced = {100, 101, 102, 103} - set(result.assignments.keys())
    assert len(unplaced) == 2
    for employee_id in unplaced:
        assert result.flagged[employee_id] == "no_slot"


def test_prefers_flight_matching_shift_preference():
    # Two teams of 2; flight A matches their shift, flight B doesn't. With
    # equal capacity elsewhere, same-shift scoring should win flight A.
    teams = [make_team(1, 2, shift_id=1)]
    flights = [
        FlightSlot(flight_id=10, shift_id=1, capacity=2),
        FlightSlot(flight_id=11, shift_id=2, capacity=2),
    ]

    result = GreedyFlightStrategy().allocate(teams, flights, DEFAULT_WEIGHTS)

    assert set(result.assignments.values()) == {10}


def test_locked_assignment_capacity_is_respected_by_caller():
    # The strategy itself doesn't know about "locked" rows — callers (the
    # runner) pre-populate FlightSlot.assigned before invoking allocate().
    # This test documents that contract: a slot with less `remaining` simply
    # accepts fewer new candidates.
    slot = FlightSlot(flight_id=10, shift_id=1, capacity=3, assigned=[999])
    assert slot.remaining == 2

    teams = [make_team(1, 2, shift_id=1)]
    result = GreedyFlightStrategy().allocate(teams, [slot], DEFAULT_WEIGHTS)

    assert len(result.assignments) == 2
    assert 999 not in result.assignments
