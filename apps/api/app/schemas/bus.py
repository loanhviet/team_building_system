from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import code, optional_text, phone


class BusCreate(BaseModel):
    leg_id: int
    code: str = Field(min_length=1, max_length=50)
    name: str | None = None
    capacity: int = Field(default=1, ge=1)
    gather_at: datetime | None = None
    depart_at: datetime | None = None
    pickup_point_id: int | None = None
    destination: str | None = None
    leader_name: str | None = None
    leader_phone: str | None = None
    note: str | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return code(value, label="Mã xe", max_length=50, required=True) or ""

    @field_validator("name", "leader_name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return optional_text(value, label="Tên", max_length=200)

    @field_validator("destination")
    @classmethod
    def normalize_destination(cls, value: str | None) -> str | None:
        return optional_text(value, label="Điểm đến", max_length=200)

    @field_validator("leader_phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        return phone(value)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        return optional_text(value, label="Ghi chú", max_length=500)

    @model_validator(mode="after")
    def validate_times(self):
        if self.gather_at and self.depart_at and self.depart_at < self.gather_at:
            raise ValueError("depart_at không được trước gather_at")
        return self


class BusUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    gather_at: datetime | None = None
    depart_at: datetime | None = None
    pickup_point_id: int | None = None
    destination: str | None = None
    leader_employee_id: int | None = None
    leader_name: str | None = None
    leader_phone: str | None = None
    note: str | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return code(value, label="Mã xe", max_length=50)

    @field_validator("name", "leader_name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return optional_text(value, label="Tên", max_length=200)

    @field_validator("destination")
    @classmethod
    def normalize_destination(cls, value: str | None) -> str | None:
        return optional_text(value, label="Điểm đến", max_length=200)

    @field_validator("leader_phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        return phone(value)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        return optional_text(value, label="Ghi chú", max_length=500)

    @model_validator(mode="after")
    def validate_times(self):
        if self.gather_at and self.depart_at and self.depart_at < self.gather_at:
            raise ValueError("depart_at không được trước gather_at")
        return self


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
    # Omit preset to use the BTC-managed Event Settings weights.
    preset: Literal["balanced", "shift_first", "team_first"] | None = None


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
    # what the CBNV actually registered for this leg — shown next to the bus
    # they got so BTC can see a pickup mismatch at a glance, same idea as
    # FlightAssignmentOut.requested_shift_name
    requested_pickup_point_name: str | None = None
    flight_code: str | None = None


class BusAdjustRequest(BaseModel):
    employee_ids: list[int] = Field(default_factory=list)
    team_id: int | None = None  # move every registered member of this team, in addition to employee_ids
    bus_id: int
    reason: str = Field(min_length=3, max_length=500)


class UnlockBusAssignmentRequest(BaseModel):
    leg_id: int
    employee_ids: list[int]
