from datetime import datetime

from pydantic import BaseModel


class FlightCreate(BaseModel):
    flight_code: str
    airline: str | None = None
    direction: str
    shift_id: int | None = None
    depart_at: datetime | None = None
    arrive_at: datetime | None = None
    origin: str | None = None
    destination: str | None = None
    capacity: int = 0
    note: str | None = None


class FlightUpdate(BaseModel):
    flight_code: str | None = None
    airline: str | None = None
    direction: str | None = None
    shift_id: int | None = None
    depart_at: datetime | None = None
    arrive_at: datetime | None = None
    origin: str | None = None
    destination: str | None = None
    capacity: int | None = None
    note: str | None = None


class FlightOut(BaseModel):
    id: int
    event_id: int
    flight_code: str
    airline: str | None
    direction: str
    shift_id: int | None
    depart_at: datetime | None
    arrive_at: datetime | None
    origin: str | None
    destination: str | None
    capacity: int
    note: str | None

    model_config = {"from_attributes": True}


class FlightAssignmentOut(BaseModel):
    id: int
    flight_id: int | None
    employee_id: int
    direction: str
    source: str
    is_locked: bool
    is_flagged: bool
    flag_reason: str | None
    employee_code: str | None
    full_name: str
    team_name: str | None


class AllocationRequest(BaseModel):
    direction: str
    weights: dict[str, float] | None = None


class AllocationRunOut(BaseModel):
    id: int
    event_id: int
    job_id: int | None
    type: str
    status: str
    params_json: dict | None
    summary_json: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AllocationEnqueuedOut(BaseModel):
    job_id: int
    allocation_run_id: int


class AdjustAssignmentRequest(BaseModel):
    employee_ids: list[int]
    flight_id: int
    reason: str
    force: bool = False
