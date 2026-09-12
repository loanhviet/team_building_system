from datetime import datetime

from pydantic import BaseModel


class BusCreate(BaseModel):
    leg_id: int
    code: str
    name: str | None = None
    capacity: int = 0
    gather_at: datetime | None = None
    depart_at: datetime | None = None
    pickup_point_id: int | None = None
    destination: str | None = None
    leader_name: str | None = None
    leader_phone: str | None = None
    note: str | None = None


class BusUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    capacity: int | None = None
    gather_at: datetime | None = None
    depart_at: datetime | None = None
    pickup_point_id: int | None = None
    destination: str | None = None
    leader_employee_id: int | None = None
    leader_name: str | None = None
    leader_phone: str | None = None
    note: str | None = None


class BusOut(BaseModel):
    id: int
    event_id: int
    leg_id: int
    code: str
    name: str | None
    capacity: int
    gather_at: datetime | None
    depart_at: datetime | None
    pickup_point_id: int | None
    destination: str | None
    leader_employee_id: int | None
    leader_name: str | None
    leader_phone: str | None
    note: str | None

    model_config = {"from_attributes": True}


class BusAllocationRequest(BaseModel):
    leg_id: int


class BusAssignmentOut(BaseModel):
    id: int
    bus_id: int | None
    employee_id: int
    leg_id: int
    source: str
    is_locked: bool
    is_flagged: bool
    flag_reason: str | None
    employee_code: str | None
    full_name: str
    team_name: str | None


class BusAdjustRequest(BaseModel):
    employee_ids: list[int] = []
    team_id: int | None = None  # move every registered member of this team, in addition to employee_ids
    bus_id: int
    reason: str
    force: bool = False
