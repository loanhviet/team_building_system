from collections import defaultdict
from dataclasses import dataclass, field

from app.services.allocation.base import AllocationResult


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
    flight_ids_present: set[int] = field(default_factory=set)

    @property
    def remaining(self) -> int:
        return self.capacity - len(self.assigned)


def allocate_buses(candidates: list[BusCandidate], buses: list[BusSlot]) -> AllocationResult:
    """Greedy per docs/PLAN.md §7.2 priority order: (1) same flight (2) same team
    (3) maximize fill (4) never exceed capacity. Groups by (flight_id, team_id) so
    people sharing both stay together, largest group first; within a group, prefers
    a bus that already carries the same flight's passengers, then best-fit by how
    much of the remaining group it can absorb."""
    groups: dict[tuple[int | None, int | None], list[BusCandidate]] = defaultdict(list)
    for c in candidates:
        groups[(c.flight_id, c.team_id)].append(c)

    assignments: dict[int, int] = {}
    flagged: dict[int, str] = {}

    for group in sorted(groups.values(), key=len, reverse=True):
        remaining = list(group)
        flight_id = group[0].flight_id
        while remaining:
            same_flight = [
                b for b in buses if b.remaining > 0 and flight_id in b.flight_ids_present
            ]
            available = same_flight or [b for b in buses if b.remaining > 0]
            if not available:
                for c in remaining:
                    flagged[c.employee_id] = "no_slot"
                break

            best = max(available, key=lambda b: min(b.remaining, len(remaining)))
            take, remaining = remaining[: best.remaining], remaining[best.remaining :]
            for c in take:
                assignments[c.employee_id] = best.bus_id
                best.assigned.append(c.employee_id)
                if flight_id is not None:
                    best.flight_ids_present.add(flight_id)

    return AllocationResult(assignments=assignments, flagged=flagged, split_team_ids=set())
