from dataclasses import dataclass, field

# Not persisted, not applied silently — the router only ever returns this as a
# preview; BTC reviews it in the workbench and explicitly applies (or edits)
# before anything is written. Gender is a hard filter (never suggest a mix),
# team-together is a soft preference, same spirit as the flight/bus greedy
# allocators but without their timing/pickup-point dimensions — a hotel room
# doesn't care what time anyone arrives.

TEAM_TOGETHER_WEIGHT = 30
FILL_RATE_WEIGHT = 20


@dataclass
class RoomCandidate:
    employee_id: int
    gender: str | None
    team_id: int | None


@dataclass
class RoomSlot:
    room_id: int
    capacity: int
    # employee_ids already assigned there before this run (kept as-is, never
    # moved) plus whatever this run places — both count toward `remaining`
    assigned: list[int] = field(default_factory=list)
    genders_present: set[str] = field(default_factory=set)
    teams_present: set[int] = field(default_factory=set)

    @property
    def remaining(self) -> int:
        return self.capacity - len(self.assigned)


@dataclass
class RoomSuggestionResult:
    assignments: dict[int, int]  # employee_id -> room_id
    unplaced: list[int]


def _compatible(slot: RoomSlot, gender: str | None) -> bool:
    # unknown gender never excluded (nothing to conflict with), same rule
    # bus/flight allocators use for unknown site/shift — see bus_greedy.py
    if gender is None:
        return True
    return not slot.genders_present or slot.genders_present == {gender}


def _score(slot: RoomSlot, group_size: int, team_id: int | None) -> float:
    team_together = float(team_id is not None and team_id in slot.teams_present)
    projected_fill = min(1.0, (len(slot.assigned) + group_size) / max(1, slot.capacity))
    return TEAM_TOGETHER_WEIGHT * team_together + FILL_RATE_WEIGHT * projected_fill


def _place(slot: RoomSlot, candidate: RoomCandidate, assignments: dict[int, int]) -> None:
    slot.assigned.append(candidate.employee_id)
    if candidate.gender:
        slot.genders_present.add(candidate.gender)
    if candidate.team_id is not None:
        slot.teams_present.add(candidate.team_id)
    assignments[candidate.employee_id] = slot.room_id


def suggest_room_assignments(
    candidates: list[RoomCandidate], slots: list[RoomSlot]
) -> RoomSuggestionResult:
    assignments: dict[int, int] = {}
    unplaced: list[int] = []

    # gender first (hard boundary), team second (largest group first, same
    # "keep the whole team's rooms together" instinct as flight/bus)
    by_gender: dict[str | None, list[RoomCandidate]] = {}
    for c in candidates:
        by_gender.setdefault(c.gender, []).append(c)

    for gender, gender_group in by_gender.items():
        by_team: dict[int | None, list[RoomCandidate]] = {}
        for c in gender_group:
            by_team.setdefault(c.team_id, []).append(c)

        for team_id, subgroup in sorted(by_team.items(), key=lambda kv: len(kv[1]), reverse=True):
            leftover = list(subgroup)
            while leftover:
                compatible = [s for s in slots if s.remaining > 0 and _compatible(s, gender)]
                if not compatible:
                    unplaced.extend(c.employee_id for c in leftover)
                    break
                best = max(compatible, key=lambda s: (_score(s, len(leftover), team_id), -s.room_id))
                take, leftover = leftover[: best.remaining], leftover[best.remaining :]
                for c in take:
                    _place(best, c, assignments)

    return RoomSuggestionResult(assignments=assignments, unplaced=unplaced)
