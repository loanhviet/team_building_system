from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.services.allocation.base import DEFAULT_BUS_WEIGHTS, AllocationResult, merge_weights

# ponytail: fixed windows, not event_settings-configurable yet — add a knob if
# BTC ever needs shorter/longer buffers than "6h before departure" / "3h after
# landing" for a specific event.
BEFORE_FLIGHT_MIN_LEAD = timedelta(hours=6)
BEFORE_FLIGHT_MAX_LEAD = timedelta(minutes=90)
AFTER_FLIGHT_MAX_WAIT = timedelta(hours=3)


@dataclass
class BusCandidate:
    employee_id: int
    team_id: int | None
    flight_id: int | None
    pickup_point_id: int | None = None
    flight_depart_at: datetime | None = None
    flight_arrive_at: datetime | None = None


@dataclass
class BusSlot:
    bus_id: int
    capacity: int
    pickup_point_id: int | None = None
    depart_at: datetime | None = None
    assigned: list[int] = field(default_factory=list)
    assigned_team_ids: list[int | None] = field(default_factory=list)
    flight_ids_present: set[int] = field(default_factory=set)

    @property
    def remaining(self) -> int:
        return self.capacity - len(self.assigned)


def bus_compatible(
    bus_pickup_point_id: int | None,
    bus_depart_at: datetime | None,
    pickup_point_id: int | None,
    flight_depart_at: datetime | None,
    flight_arrive_at: datetime | None,
    flight_timing: str | None,
) -> bool:
    """Hard physical compatibility shared by automatic and manual allocation.

    Missing bus/timing data is not silently accepted when the employee's
    registration or the leg requires it; preflight explains the same issue to
    the organizer before a run starts.
    """
    if pickup_point_id is not None and bus_pickup_point_id != pickup_point_id:
        return False

    if flight_timing not in ("before_flight", "after_flight"):
        return True
    if bus_depart_at is None:
        return False

    if flight_timing == "before_flight":
        if flight_depart_at is None:
            return False
        window_start = flight_depart_at - BEFORE_FLIGHT_MIN_LEAD
        window_end = flight_depart_at - BEFORE_FLIGHT_MAX_LEAD
        return window_start <= bus_depart_at <= window_end

    # after_flight
    if flight_arrive_at is None:
        return False
    return flight_arrive_at <= bus_depart_at <= flight_arrive_at + AFTER_FLIGHT_MAX_WAIT


def _score(
    bus: BusSlot,
    remaining: list[BusCandidate],
    flight_id: int | None,
    team_id: int | None,
    weights: dict[str, float],
) -> float:
    same_flight = 1.0 if flight_id is not None and flight_id in bus.flight_ids_present else 0.0
    same_team = float(
        team_id is not None and any(tid is not None and tid == team_id for tid in bus.assigned_team_ids)
    )
    projected_fill = min(
        1.0, (len(bus.assigned) + min(bus.remaining, len(remaining))) / max(1, bus.capacity)
    )
    return (
        weights["same_flight"] * same_flight
        + weights["team_together"] * same_team
        + weights["fill_rate"] * projected_fill
    )


def allocate_buses(
    candidates: list[BusCandidate],
    buses: list[BusSlot],
    weights: dict[str, float] | None = None,
    flight_timing: str | None = None,
) -> AllocationResult:
    """Greedy per docs/PLAN.md §7.2: same flight, same team, fill, never over
    capacity — plus two hard filters this greedy previously ignored entirely
    (see docs/REBUILD-PLAN.md §R7): the CBNV's registered pickup point, and
    (when `flight_timing` says this leg feeds/follows a flight) a bus whose
    depart_at actually lines up with that flight's time. Weights come from
    event settings (`bus_allocation_weights`)."""
    weights = merge_weights(weights, DEFAULT_BUS_WEIGHTS)
    groups: dict[tuple[int | None, int | None, int | None], list[BusCandidate]] = defaultdict(list)
    for c in candidates:
        groups[(c.flight_id, c.team_id, c.pickup_point_id)].append(c)

    assignments: dict[int, int] = {}
    flagged: dict[int, str] = {}

    for group in sorted(groups.values(), key=len, reverse=True):
        remaining = list(group)
        flight_id = group[0].flight_id
        team_id = group[0].team_id
        pickup_point_id = group[0].pickup_point_id
        flight_depart_at = group[0].flight_depart_at
        flight_arrive_at = group[0].flight_arrive_at

        while remaining:
            available = [b for b in buses if b.remaining > 0]
            if not available:
                for c in remaining:
                    flagged[c.employee_id] = "no_slot"
                break

            compatible = [
                b for b in available
                if bus_compatible(
                    b.pickup_point_id, b.depart_at, pickup_point_id,
                    flight_depart_at, flight_arrive_at, flight_timing,
                )
            ]
            if not compatible:
                for c in remaining:
                    flagged[c.employee_id] = "no_compatible_bus"
                break

            best = max(
                compatible,
                key=lambda b: (_score(b, remaining, flight_id, team_id, weights), -b.bus_id),
            )
            take, remaining = remaining[: best.remaining], remaining[best.remaining :]
            for c in take:
                assignments[c.employee_id] = best.bus_id
                best.assigned.append(c.employee_id)
                best.assigned_team_ids.append(c.team_id)
                if flight_id is not None:
                    best.flight_ids_present.add(flight_id)

    return AllocationResult(assignments=assignments, flagged=flagged, split_team_ids=set())
