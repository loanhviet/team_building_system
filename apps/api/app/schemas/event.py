from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import EventStatus


class EventCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    destination: str | None = None
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None

    @model_validator(mode="after")
    def validate_ranges(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date không được trước start_date")
        if self.registration_open_at and self.registration_close_at and self.registration_close_at <= self.registration_open_at:
            raise ValueError("registration_close_at phải sau registration_open_at")
        return self


class EventUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    destination: str | None = None
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None


class EventTransition(BaseModel):
    status: EventStatus
    confirm_warnings: bool = False


class EventSettingsOut(BaseModel):
    terms_text: str
    terms_version: str
    flight_allocation_weights: dict[str, float]
    bus_allocation_weights: dict[str, float]


class EventSettingsUpdate(BaseModel):
    terms_text: str | None = None
    terms_version: str | None = None
    flight_allocation_weights: dict[str, float] | None = None
    bus_allocation_weights: dict[str, float] | None = None


class EventOut(BaseModel):
    id: int
    code: str
    name: str
    description: str | None
    start_date: date | None
    end_date: date | None
    destination: str | None
    status: str
    registration_open_at: datetime | None
    registration_close_at: datetime | None
    published_at: datetime | None

    model_config = {"from_attributes": True}


class EmployeeEventOut(EventOut):
    """Events a CBNV is allowed to see — never drafts they didn't touch."""

    can_register: bool = False
    has_journey: bool = False
    registration_status: str | None = None


class ShiftCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    depart_after_time: str | None = None
    sort_order: int = 0


class ShiftUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    depart_after_time: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class ShiftOut(BaseModel):
    id: int
    event_id: int
    code: str
    name: str
    description: str | None
    depart_after_time: str | None
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class TransportLegCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    direction: Literal["outbound", "inbound", "local"]
    sort_order: int = 0
    flight_timing: Literal["before_flight", "after_flight"] | None = None


class TransportLegUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    direction: Literal["outbound", "inbound", "local"] | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    flight_timing: Literal["before_flight", "after_flight"] | None = None


class TransportLegOut(BaseModel):
    id: int
    event_id: int
    code: str
    name: str
    direction: str
    sort_order: int
    is_active: bool
    flight_timing: str | None

    model_config = {"from_attributes": True}


class PickupPointCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    site_id: int | None = None
    address: str | None = None


class PickupPointUpdate(BaseModel):
    name: str | None = None
    site_id: int | None = None
    address: str | None = None
    is_active: bool | None = None


class PickupPointOut(BaseModel):
    id: int
    event_id: int
    site_id: int | None
    name: str
    address: str | None
    is_active: bool

    model_config = {"from_attributes": True}
