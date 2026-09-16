from app.services.room_suggestion import RoomCandidate, RoomSlot, suggest_room_assignments


def test_never_mixes_genders_even_when_it_would_fill_better():
    candidates = [
        RoomCandidate(employee_id=1, gender="male", team_id=1),
        RoomCandidate(employee_id=2, gender="female", team_id=1),
    ]
    # one room, capacity 2 — a naive "just fill it" pass would put both here
    slots = [RoomSlot(room_id=1, capacity=2)]

    result = suggest_room_assignments(candidates, slots)

    assert result.assignments[1] != result.assignments.get(2, None) or 2 not in result.assignments
    # with only one slot and two genders, exactly one of them must be unplaced
    assert len(result.unplaced) == 1


def test_keeps_team_together_when_capacity_allows():
    candidates = [RoomCandidate(employee_id=i, gender="male", team_id=1) for i in range(4)]
    slots = [RoomSlot(room_id=1, capacity=6), RoomSlot(room_id=2, capacity=6)]

    result = suggest_room_assignments(candidates, slots)

    assert len(set(result.assignments.values())) == 1
    assert not result.unplaced


def test_splits_team_across_rooms_when_one_room_is_not_enough():
    candidates = [RoomCandidate(employee_id=i, gender="female", team_id=1) for i in range(5)]
    slots = [RoomSlot(room_id=1, capacity=2), RoomSlot(room_id=2, capacity=3)]

    result = suggest_room_assignments(candidates, slots)

    assert len(result.assignments) == 5
    assert not result.unplaced
    assert set(result.assignments.values()) == {1, 2}


def test_unknown_gender_never_excluded_and_never_blocks_others():
    candidates = [
        RoomCandidate(employee_id=1, gender="male", team_id=None),
        RoomCandidate(employee_id=2, gender=None, team_id=None),
    ]
    slots = [RoomSlot(room_id=1, capacity=2)]

    result = suggest_room_assignments(candidates, slots)

    assert result.assignments == {1: 1, 2: 1}


def test_respects_existing_occupants_gender_and_capacity():
    candidates = [RoomCandidate(employee_id=1, gender="female", team_id=None)]
    # room already has a man in it via a prior manual assignment, one seat left
    slots = [RoomSlot(room_id=1, capacity=2, assigned=[99], genders_present={"male"})]

    result = suggest_room_assignments(candidates, slots)

    assert result.assignments == {}
    assert result.unplaced == [1]


if __name__ == "__main__":
    test_never_mixes_genders_even_when_it_would_fill_better()
    test_keeps_team_together_when_capacity_allows()
    test_splits_team_across_rooms_when_one_room_is_not_enough()
    test_unknown_gender_never_excluded_and_never_blocks_others()
    test_respects_existing_occupants_gender_and_capacity()
    print("ok")
