import math
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import EventStatus
from app.schemas.common import clock_hhmm, code, optional_text, required_text


class EventCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    destination: str | None = None
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return code(value, label="Mã sự kiện", max_length=50, required=True) or ""

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return required_text(value, label="Tên sự kiện", max_length=200)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return optional_text(value, label="Mô tả", max_length=2000)

    @field_validator("destination")
    @classmethod
    def normalize_destination(cls, value: str | None) -> str | None:
        return optional_text(value, label="Điểm đến", max_length=200)

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

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        return optional_text(value, label="Tên sự kiện", max_length=200)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return optional_text(value, label="Mô tả", max_length=2000)

    @field_validator("destination")
    @classmethod
    def normalize_destination(cls, value: str | None) -> str | None:
        return optional_text(value, label="Điểm đến", max_length=200)

    @model_validator(mode="after")
    def name_cannot_be_cleared(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Tên sự kiện không được để trống")
        return self


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

    @field_validator("flight_allocation_weights", "bus_allocation_weights")
    @classmethod
    def weights_must_be_finite(cls, value: dict[str, float] | None) -> dict[str, float] | None:
        if value is not None and any(not math.isfinite(weight) for weight in value.values()):
            raise ValueError("Trọng số phải là số hữu hạn")
        return value


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

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return code(value, label="Mã ca", max_length=50, required=True) or ""

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return required_text(value, label="Tên ca", max_length=200)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return optional_text(value, label="Mô tả ca", max_length=500)

    @field_validator("depart_after_time")
    @classmethod
    def normalize_time(cls, value: str | None) -> str | None:
        return clock_hhmm(value)


class ShiftUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    depart_after_time: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return code(value, label="Mã ca", max_length=50)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return optional_text(value, label="Tên ca", max_length=200)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return optional_text(value, label="Mô tả ca", max_length=500)

    @field_validator("depart_after_time")
    @classmethod
    def normalize_time(cls, value: str | None) -> str | None:
        return clock_hhmm(value)


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
    kind: Literal["workplace", "venue"] = "workplace"

    @model_validator(mode="after")
    def workplace_needs_a_site(self):
        if self.kind == "workplace" and self.site_id is None:
            raise ValueError("Điểm nơi làm việc phải gắn địa điểm làm việc")
        return self


class PickupPointUpdate(BaseModel):
    name: str | None = None
    site_id: int | None = None
    address: str | None = None
    kind: Literal["workplace", "venue"] | None = None
    is_active: bool | None = None


class PickupPointOut(BaseModel):
    id: int
    event_id: int
    site_id: int | None
    kind: str
    name: str
    address: str | None
    is_active: bool

    model_config = {"from_attributes": True}
