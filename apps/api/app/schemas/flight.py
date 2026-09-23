from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import code, optional_text


class FlightCreate(BaseModel):
    flight_code: str = Field(min_length=1, max_length=50)
    airline: str | None = None
    direction: Literal["outbound", "inbound"]
    shift_id: int | None = None
    site_id: int | None = None
    depart_at: datetime | None = None
    arrive_at: datetime | None = None
    origin: str | None = None
    destination: str | None = None
    capacity: int = Field(default=1, ge=1)
    note: str | None = None

    @field_validator("flight_code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return code(value, label="Mã chuyến bay", max_length=50, required=True) or ""

    @field_validator("airline")
    @classmethod
    def normalize_airline(cls, value: str | None) -> str | None:
        return optional_text(value, label="Hãng bay", max_length=100)

    @field_validator("origin", "destination")
    @classmethod
    def normalize_place(cls, value: str | None) -> str | None:
        return optional_text(value, label="Điểm đi/đến", max_length=100)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        return optional_text(value, label="Ghi chú", max_length=500)

    @model_validator(mode="after")
    def validate_times(self):
        if self.depart_at and self.arrive_at and self.arrive_at <= self.depart_at:
            raise ValueError("arrive_at phải sau depart_at")
        return self


class FlightUpdate(BaseModel):
    flight_code: str | None = None
    airline: str | None = None
    direction: Literal["outbound", "inbound"] | None = None
    shift_id: int | None = None
    site_id: int | None = None
    depart_at: datetime | None = None
    arrive_at: datetime | None = None
    origin: str | None = None
    destination: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    note: str | None = None

    @field_validator("flight_code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return code(value, label="Mã chuyến bay", max_length=50)

    @field_validator("airline")
    @classmethod
    def normalize_airline(cls, value: str | None) -> str | None:
        return optional_text(value, label="Hãng bay", max_length=100)

    @field_validator("origin", "destination")
    @classmethod
    def normalize_place(cls, value: str | None) -> str | None:
        return optional_text(value, label="Điểm đi/đến", max_length=100)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        return optional_text(value, label="Ghi chú", max_length=500)

    @model_validator(mode="after")
    def validate_times(self):
        if self.depart_at and self.arrive_at and self.arrive_at <= self.depart_at:
            raise ValueError("arrive_at phải sau depart_at")
        return self


class FlightOut(BaseModel):
    id: int
    event_id: int
    flight_code: str
    airline: str | None
    direction: str
    shift_id: int | None
    site_id: int | None
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
    employee_site_id: int | None = None
    # the shift the employee registered for (their "nguyện vọng") -- shown
    # next to the flight they actually got so BTC can see a shift_mismatch
    # flag's requested-vs-actual at a glance instead of digging per row
    requested_shift_name: str | None = None


class AllocationRequest(BaseModel):
    direction: Literal["outbound", "inbound"]
    # Omit preset to use the BTC-managed Event Settings weights.
    preset: Literal["balanced", "shift_first", "team_first"] | None = None


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
    employee_ids: list[int] = Field(default_factory=list)
    team_id: int | None = None  # move every registered member of this team, in addition to employee_ids
    flight_id: int
    reason: str = Field(min_length=3, max_length=500)
    accept_soft_warnings: bool = False


class UnlockAssignmentRequest(BaseModel):
    direction: str
    employee_ids: list[int]
