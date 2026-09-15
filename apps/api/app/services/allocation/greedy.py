from app.services.allocation.base import AllocationResult, Candidate, FlightSlot, TeamGroup


def _score(flight: FlightSlot, group: list[Candidate], weights: dict[str, float]) -> float:
    if not group:
        return 0.0
    same_shift = sum(1 for c in group if not _is_shift_mismatch(c, flight)) / len(group)
    team_id = group[0].team_id if group else None
    team_together = float(
        team_id is not None and any(tid == team_id for tid in flight.assigned_team_ids)
    )
    projected_fill = min(1.0, (len(flight.assigned) + len(group)) / max(1, flight.capacity))
    return (
        weights["same_shift"] * same_shift
        + weights["team_together"] * team_together
        + weights["fill_rate"] * projected_fill
    )


def _place(flight: FlightSlot, candidate: Candidate, flight_id_by_employee: dict[int, int]) -> None:
    flight.assigned.append(candidate.employee_id)
    flight.assigned_team_ids.append(candidate.team_id)
    flight_id_by_employee[candidate.employee_id] = flight.flight_id


def _is_shift_mismatch(candidate: Candidate, flight: FlightSlot) -> bool:
    # a flight with no shift_id (inbound flights have none — BRD's Ca 1/Ca 2 is
    # only a thing for the outbound "Ca đi") has nothing to mismatch against;
    # only flag/penalize when the flight actually represents a specific shift
    if candidate.shift_id is None or flight.shift_id is None:
        return False
    return candidate.shift_id != flight.shift_id


def _site_ok(flight: FlightSlot, site_id: int | None) -> bool:
    # a flight with no site set serves everyone; a team/candidate with no
    # known site is never excluded either — this is a hard filter (never a
    # score penalty), because boarding someone on a flight from the wrong
    # city isn't "suboptimal", it's simply wrong
    return flight.site_id is None or site_id is None or flight.site_id == site_id


class GreedyFlightStrategy:
    """Greedy allocator per docs/PLAN.md §7.1: place whole teams first, split the
    largest-remaining-shift-subgroup when a team can't fit, flag whatever's left over.

    `split_penalty / same_shift` is how many shift-mismatched people we'll
    swallow to keep a team on one flight. Above that, the team is split so
    members can land on flights matching their own Ca."""

    def allocate(
        self, teams: list[TeamGroup], flights: list[FlightSlot], weights: dict[str, float]
    ) -> AllocationResult:
        assignments: dict[int, int] = {}
        flagged: dict[int, str] = {}
        split_team_ids: set[int] = set()

        for team in sorted(teams, key=lambda t: len(t.employees), reverse=True):
            group = list(team.employees)

            whole_fit = [
                f for f in flights if f.remaining >= len(group) and _site_ok(f, team.site_id)
            ]
            best_whole = max(
                whole_fit, key=lambda f: (_score(f, group, weights), -f.flight_id)
            ) if whole_fit else None

            force_split = False
            if best_whole is not None:
                mismatch = sum(1 for c in group if _is_shift_mismatch(c, best_whole))
                same_shift_w = max(float(weights.get("same_shift") or 0), 1e-9)
                split_w = max(float(weights.get("split_penalty") or 0), 0.0)
                allowed_ratio = split_w / (same_shift_w + split_w)
                if mismatch / max(1, len(group)) > allowed_ratio:
                    force_split = True

            if best_whole is not None and not force_split:
                for c in group:
                    _place(best_whole, c, assignments)
                    # even though the whole team fit, a member may still land on
                    # a flight that doesn't match their own shift preference —
                    # flag it so BTC can see it, instead of only ever flagging
                    # mismatches in the split branch below
                    if _is_shift_mismatch(c, best_whole):
                        flagged[c.employee_id] = "shift_mismatch"
                continue

            if team.team_id is not None:
                split_team_ids.add(team.team_id)

            by_shift: dict[int | None, list[Candidate]] = {}
            for c in group:
                by_shift.setdefault(c.shift_id, []).append(c)

            for subgroup in sorted(by_shift.values(), key=len, reverse=True):
                leftover = list(subgroup)
                while leftover:
                    candidates = [
                        f for f in flights if f.remaining > 0 and _site_ok(f, team.site_id)
                    ]
                    if not candidates:
                        for c in leftover:
                            flagged[c.employee_id] = "no_slot"
                        break
                    best = max(
                        candidates, key=lambda f: (_score(f, leftover, weights), -f.flight_id)
                    )
                    take, leftover = leftover[: best.remaining], leftover[best.remaining :]
                    for c in take:
                        _place(best, c, assignments)
                        if _is_shift_mismatch(c, best):
                            flagged[c.employee_id] = "shift_mismatch"

        return AllocationResult(
            assignments=assignments, flagged=flagged, split_team_ids=split_team_ids
        )
