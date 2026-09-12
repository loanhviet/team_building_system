from datetime import date, datetime

from pydantic import BaseModel


class HotelCreate(BaseModel):
    name: str
    address: str | None = None
    checkin_date: date | None = None
    checkout_date: date | None = None
    note: str | None = None


class HotelUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    checkin_date: date | None = None
    checkout_date: date | None = None
    note: str | None = None


class HotelOut(BaseModel):
    id: int
    event_id: int
    name: str
    address: str | None
    checkin_date: date | None
    checkout_date: date | None
    note: str | None

    model_config = {"from_attributes": True}


class RoomTypeCreate(BaseModel):
    name: str
    capacity: int = 2
    quantity: int = 0


class RoomTypeOut(BaseModel):
    id: int
    hotel_id: int
    name: str
    capacity: int
    quantity: int

    model_config = {"from_attributes": True}


class RoomCreate(BaseModel):
    room_number: str
    room_type_id: int | None = None
    capacity: int = 2
    note: str | None = None


class RoomUpdate(BaseModel):
    room_number: str | None = None
    room_type_id: int | None = None
    capacity: int | None = None
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
    hotel_name: str
    room_number: str
    assigned_at: datetime | None

    model_config = {"from_attributes": True}


class ImportResultOut(BaseModel):
    ok_rows: int
    error_rows: int
    errors: list[dict]
