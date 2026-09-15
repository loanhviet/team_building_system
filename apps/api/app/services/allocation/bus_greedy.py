from collections import defaultdict
from dataclasses import dataclass, field

from app.services.allocation.base import DEFAULT_BUS_WEIGHTS, AllocationResult, merge_weights


@dataclass
class BusCandidate:
    employee_id: int
    team_id: int | None
    flight_id: int | None


@dataclass
class BusSlot:
    bus_id: int
    capacity: int
    assigned: list[int] = field(default_factory=list)
    assigned_team_ids: list[int | None] = field(default_factory=list)
    flight_ids_present: set[int] = field(default_factory=set)

    @property
    def remaining(self) -> int:
        return self.capacity - len(self.assigned)


def _score(
    bus: BusSlot,
    remaining: list[BusCandidate],
    flight_id: int | None,
    team_id: int | None,
    weights: dict[str, float],
) -> float:
    same_flight = 1.0 if flight_id is not None and flight_id in bus.flight_ids_present else 0.0
    same_team = sum(1 for tid in bus.assigned_team_ids if tid is not None and tid == team_id)
    fill = min(bus.remaining, len(remaining))
    return (
        weights["same_flight"] * same_flight
        + weights["team_together"] * same_team
        + weights["fill_rate"] * fill
    )


def allocate_buses(
    candidates: list[BusCandidate],
    buses: list[BusSlot],
    weights: dict[str, float] | None = None,
) -> AllocationResult:
    """Greedy per docs/PLAN.md §7.2: same flight, same team, fill, never over
    capacity. Weights come from event settings (`bus_allocation_weights`)."""
    weights = merge_weights(weights, DEFAULT_BUS_WEIGHTS)
    groups: dict[tuple[int | None, int | None], list[BusCandidate]] = defaultdict(list)
    for c in candidates:
        groups[(c.flight_id, c.team_id)].append(c)

    assignments: dict[int, int] = {}
    flagged: dict[int, str] = {}

    for group in sorted(groups.values(), key=len, reverse=True):
        remaining = list(group)
        flight_id = group[0].flight_id
        while remaining:
            available = [b for b in buses if b.remaining > 0]
            if not available:
                for c in remaining:
                    flagged[c.employee_id] = "no_slot"
                break

            team_id = group[0].team_id
            best = max(
                available,
                key=lambda b: _score(b, remaining, flight_id, team_id, weights),
            )
            take, remaining = remaining[: best.remaining], remaining[best.remaining :]
            for c in take:
                assignments[c.employee_id] = best.bus_id
                best.assigned.append(c.employee_id)
                best.assigned_team_ids.append(c.team_id)
                if flight_id is not None:
                    best.flight_ids_present.add(flight_id)

    return AllocationResult(assignments=assignments, flagged=flagged, split_team_ids=set())
