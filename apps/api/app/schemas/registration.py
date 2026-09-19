from datetime import datetime

from pydantic import BaseModel, Field


class TransportNeedIn(BaseModel):
    leg_id: int
    is_needed: bool
    pickup_point_id: int | None = None


class TransportNeedOut(BaseModel):
    leg_id: int
    is_needed: bool
    pickup_point_id: int | None

    model_config = {"from_attributes": True}


class RegistrationUpdate(BaseModel):
    is_participating: bool | None = None
    shift_id: int | None = None
    wish_note: str | None = Field(default=None, max_length=2000)
    transport_needs: list[TransportNeedIn] | None = None


class RegistrationSubmit(BaseModel):
    is_participating: bool
    agreed_terms: bool = False
    terms_version: str = "v1"


class RegistrationCancel(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class RegistrationOut(BaseModel):
    id: int
    event_id: int
    employee_id: int
    status: str
    is_participating: bool | None
    shift_id: int | None
    wish_note: str | None
    terms_version: str | None
    submitted_at: datetime | None
    cancelled_at: datetime | None
    transport_needs: list[TransportNeedOut]


class RegistrationAdminOut(RegistrationOut):
    employee_code: str | None
    full_name: str
    email: str
    team_id: int | None = None
    team_name: str | None
    team_code: str | None = None
    position: str | None = None
    shift_name: str | None = None
    transport_summary: str | None = None


class EventTermsOut(BaseModel):
    terms_text: str
    terms_version: str
