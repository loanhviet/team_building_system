from dataclasses import dataclass, field
from typing import Protocol

DEFAULT_WEIGHTS = {
    "same_shift": 10,  # đúng nguyện vọng ca của cá nhân
    "team_together": 8,  # mỗi thành viên cùng Team đã ở chuyến đó
    "fill_rate": 2,  # ưu tiên lấp đầy chuyến đang dùng dở
    "split_penalty": 15,  # phạt mỗi lần phải tách Team
}


@dataclass
class Candidate:
    employee_id: int
    team_id: int | None
    shift_id: int | None


@dataclass
class TeamGroup:
    team_id: int | None
    employees: list[Candidate]


@dataclass
class FlightSlot:
    flight_id: int
    shift_id: int | None
    capacity: int
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
