from app.services.allocation.base import AllocationResult, Candidate, FlightSlot, TeamGroup


def _score(flight: FlightSlot, group: list[Candidate], weights: dict[str, float]) -> float:
    same_shift = sum(1 for c in group if c.shift_id == flight.shift_id)
    fill_bonus = weights["fill_rate"] * (flight.capacity - flight.remaining)
    return weights["same_shift"] * same_shift + fill_bonus


class GreedyFlightStrategy:
    """Greedy allocator per docs/PLAN.md §7.1: place whole teams first, split the
    largest-remaining-shift-subgroup when a team can't fit, flag whatever's left over."""

    def allocate(
        self, teams: list[TeamGroup], flights: list[FlightSlot], weights: dict[str, float]
    ) -> AllocationResult:
        assignments: dict[int, int] = {}
        flagged: dict[int, str] = {}
        split_team_ids: set[int] = set()

        for team in sorted(teams, key=lambda t: len(t.employees), reverse=True):
            group = list(team.employees)

            whole_fit = [f for f in flights if f.remaining >= len(group)]
            if whole_fit:
                best = max(whole_fit, key=lambda f: _score(f, group, weights))
                for c in group:
                    assignments[c.employee_id] = best.flight_id
                    best.assigned.append(c.employee_id)
                continue

            if team.team_id is not None:
                split_team_ids.add(team.team_id)

            by_shift: dict[int | None, list[Candidate]] = {}
            for c in group:
                by_shift.setdefault(c.shift_id, []).append(c)

            for subgroup in sorted(by_shift.values(), key=len, reverse=True):
                leftover = list(subgroup)
                while leftover:
                    candidates = [f for f in flights if f.remaining > 0]
                    if not candidates:
                        for c in leftover:
                            flagged[c.employee_id] = "no_slot"
                        break
                    best = max(candidates, key=lambda f: _score(f, leftover, weights))
                    take, leftover = leftover[: best.remaining], leftover[best.remaining :]
                    for c in take:
                        assignments[c.employee_id] = best.flight_id
                        best.assigned.append(c.employee_id)
                        if c.shift_id != best.shift_id:
                            flagged[c.employee_id] = "shift_mismatch"

        return AllocationResult(
            assignments=assignments, flagged=flagged, split_team_ids=split_team_ids
        )
