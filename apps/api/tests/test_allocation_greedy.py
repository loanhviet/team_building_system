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


def test_team_together_breaks_tie_between_equally_filled_flights():
    # Two flights, same shift, same "how full already" (1 slot used each) — the
    # only difference is which team that existing occupant belongs to. The new
    # pair (team 1) should join the flight that already has a team-1 member.
    team = make_team(1, 2, shift_id=1)
    flight_a = FlightSlot(
        flight_id=10, shift_id=1, capacity=4, assigned=[999], assigned_team_ids=[1]
    )
    flight_b = FlightSlot(
        flight_id=11, shift_id=1, capacity=3, assigned=[888], assigned_team_ids=[2]
    )

    result = GreedyFlightStrategy().allocate([team], [flight_a, flight_b], DEFAULT_WEIGHTS)

    assert set(result.assignments.values()) == {10}


def test_whole_fit_flags_shift_mismatch_without_forcing_split():
    # 2 people on shift 1, 1 on shift 2; the only flight big enough for the
    # whole team of 3 is shift 1 — mismatch is small (1 * same_shift(10) = 10,
    # not > split_penalty(15)) so the team stays whole and the mismatched
    # person is flagged, rather than silently placed with no visibility.
    team = TeamGroup(
        team_id=1,
        employees=[
            Candidate(employee_id=101, team_id=1, shift_id=1),
            Candidate(employee_id=102, team_id=1, shift_id=1),
            Candidate(employee_id=103, team_id=1, shift_id=2),
        ],
    )
    flights = [FlightSlot(flight_id=10, shift_id=1, capacity=3)]

    result = GreedyFlightStrategy().allocate([team], flights, DEFAULT_WEIGHTS)

    assert len(result.assignments) == 3
    assert set(result.assignments.values()) == {10}
    assert not result.split_team_ids
    assert result.flagged == {103: "shift_mismatch"}


def test_split_penalty_forces_split_when_mismatch_too_costly():
    # 1 person on shift 1, 2 on shift 2; the only flight big enough for the
    # whole team is shift 1 — mismatch would be 2 people (2 * same_shift(10) =
    # 20 > split_penalty(15)), so the team should be split instead of forced
    # whole, landing every member on a flight matching their own shift with
    # nobody flagged.
    team = TeamGroup(
        team_id=1,
        employees=[
            Candidate(employee_id=101, team_id=1, shift_id=1),
            Candidate(employee_id=102, team_id=1, shift_id=2),
            Candidate(employee_id=103, team_id=1, shift_id=2),
        ],
    )
    flights = [
        FlightSlot(flight_id=10, shift_id=1, capacity=3),
        FlightSlot(flight_id=11, shift_id=2, capacity=2),
    ]

    result = GreedyFlightStrategy().allocate([team], flights, DEFAULT_WEIGHTS)

    assert len(result.assignments) == 3
    assert result.split_team_ids == {1}
    assert result.assignments[101] == 10
    assert result.assignments[102] == 11
    assert result.assignments[103] == 11
    assert not result.flagged


def test_flight_with_no_shift_never_flags_or_forces_split():
    # Inbound flights have no shift_id at all (BRD's Ca 1/Ca 2 only applies to
    # the outbound "Ca đi") — a candidate's personal shift preference must not
    # be treated as a mismatch against a flight that has no shift concept,
    # otherwise every inbound placement gets bogusly flagged/split.
    team = TeamGroup(
        team_id=1,
        employees=[
            Candidate(employee_id=101, team_id=1, shift_id=1),
            Candidate(employee_id=102, team_id=1, shift_id=2),
            Candidate(employee_id=103, team_id=1, shift_id=2),
        ],
    )
    flights = [FlightSlot(flight_id=10, shift_id=None, capacity=3)]

    result = GreedyFlightStrategy().allocate([team], flights, DEFAULT_WEIGHTS)

    assert len(result.assignments) == 3
    assert set(result.assignments.values()) == {10}
    assert not result.split_team_ids
    assert not result.flagged
