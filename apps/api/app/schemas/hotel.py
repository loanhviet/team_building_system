from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


class HotelCreate(BaseModel):
    code: str = Field(min_length=1, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=200)
    address: str | None = None
    checkin_date: date | None = None
    checkout_date: date | None = None
    note: str | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.checkin_date and self.checkout_date and self.checkout_date <= self.checkin_date:
            raise ValueError("checkout_date phải sau checkin_date")
        return self


class HotelUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    name: str | None = None
    address: str | None = None
    checkin_date: date | None = None
    checkout_date: date | None = None
    note: str | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.checkin_date and self.checkout_date and self.checkout_date <= self.checkin_date:
            raise ValueError("checkout_date phải sau checkin_date")
        return self


class HotelOut(BaseModel):
    id: int
    event_id: int
    code: str
    name: str
    address: str | None
    checkin_date: date | None
    checkout_date: date | None
    note: str | None

    model_config = {"from_attributes": True}


class RoomTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(default=2, ge=1)
    quantity: int = Field(default=0, ge=0)


class RoomTypeUpdate(BaseModel):
    name: str | None = None
    capacity: int | None = Field(default=None, ge=1)
    quantity: int | None = Field(default=None, ge=0)


class RoomTypeOut(BaseModel):
    id: int
    hotel_id: int
    name: str
    capacity: int
    quantity: int

    model_config = {"from_attributes": True}


class RoomCreate(BaseModel):
    room_number: str = Field(min_length=1, max_length=50)
    room_type_id: int | None = None
    capacity: int = Field(default=2, ge=1)
    note: str | None = None


class RoomUpdate(BaseModel):
    room_number: str | None = None
    room_type_id: int | None = None
    capacity: int | None = Field(default=None, ge=1)
    note: str | None = None


class RoomOut(BaseModel):
    id: int
    hotel_id: int
    room_number: str
    room_type_id: int | None
    capacity: int
    note: str | None
    occupied: int = 0

    model_config = {"from_attributes": True}


class RoomAssignmentCreate(BaseModel):
    employee_id: int
    room_id: int


class RoomAssignmentOut(BaseModel):
    id: int
    room_id: int
    employee_id: int
    source: str
    employee_code: str | None
    full_name: str
    team_name: str | None
    hotel_code: str
    hotel_name: str
    room_number: str
    assigned_at: datetime | None

    model_config = {"from_attributes": True}


class ImportResultOut(BaseModel):
    ok_rows: int
    error_rows: int
    errors: list[dict]
