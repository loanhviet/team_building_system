from dataclasses import dataclass, field
from typing import Protocol

# Percent-style defaults (sum 100) — BTC chỉnh trên Cấu hình sự kiện.
# Scoring uses them as relative weights; split uses split_penalty / same_shift
# as "how many shift-mismatched people we'll swallow to keep the team whole".
DEFAULT_WEIGHTS = {
    "same_shift": 40,
    "team_together": 30,
    "fill_rate": 20,
    "split_penalty": 10,
}

DEFAULT_BUS_WEIGHTS = {
    "same_flight": 50,
    "team_together": 30,
    "fill_rate": 20,
}


def merge_weights(stored: dict | None, defaults: dict[str, float]) -> dict[str, float]:
    raw = stored if isinstance(stored, dict) else {}
    out: dict[str, float] = {}
    for key, default in defaults.items():
        try:
            out[key] = float(raw.get(key, default))
        except (TypeError, ValueError):
            out[key] = default
        if out[key] < 0:
            out[key] = 0.0
    return out


@dataclass
class Candidate:
    employee_id: int
    team_id: int | None
    shift_id: int | None


@dataclass
class TeamGroup:
    team_id: int | None
    employees: list[Candidate]
    # office site (HN/HCM) this subgroup flies from — runner splits a team
    # into one TeamGroup per (team_id, site_id) so a team spread across sites
    # is never scored as "should be kept whole" across an impossible site gap
    site_id: int | None = None


@dataclass
class FlightSlot:
    flight_id: int
    shift_id: int | None
    capacity: int
    # null = serves any site; set = only candidates from that site may board
    site_id: int | None = None
    assigned: list[int] = field(default_factory=list)
    # parallel to `assigned` (same index = same employee) so `_score` can reward
    # "team_together" without a second lookup — appended alongside every
    # assigned.append(employee_id) call, including for pre-locked assignments
    assigned_team_ids: list[int | None] = field(default_factory=list)

    @property
    def remaining(self) -> int:
        return self.capacity - len(self.assigned)


@dataclass
class AllocationResult:
    assignments: dict[int, int]  # employee_id -> flight_id
    flagged: dict[int, str]  # employee_id -> flag_reason
    split_team_ids: set[int]


class AllocationStrategy(Protocol):
    def allocate(
        self, teams: list[TeamGroup], flights: list[FlightSlot], weights: dict[str, float]
    ) -> AllocationResult: ...
