from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import code, optional_text, required_text


class GalaConfigIn(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return required_text(value, label="Tên Gala", max_length=200)

    @field_validator("stage_label")
    @classmethod
    def normalize_stage(cls, value: str) -> str:
        return required_text(value, label="Nhãn sân khấu", max_length=100)

    stage_label: str = "SÂN KHẤU"
    turn_duration_seconds: int = Field(default=60, ge=5)
    hold_ttl_seconds: int = Field(default=30, ge=5)
    seat_quota_rule: Literal["by_team_size", "fixed"] = "by_team_size"
    fixed_quota: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _fixed_rule_needs_a_quota(self) -> "GalaConfigIn":
        # `compute_team_quota` returns `fixed_quota or 0` for this rule, so a
        # missing/zero value drew a full queue of quota-0 turns where the very
        # first seat click answered `quota_exceeded` — an unrecoverable Gala
        # (draw_turns refuses to re-draw once turns exist).
        if self.seat_quota_rule == "fixed" and not self.fixed_quota:
            raise ValueError(
                "Chọn quy tắc 'Hạn mức cố định' thì phải nhập số ghế mỗi Team (tối thiểu 1)"
            )
        return self


class GalaConfigOut(BaseModel):
    id: int
    event_id: int
    name: str
    stage_label: str
    turn_duration_seconds: int
    hold_ttl_seconds: int
    seat_quota_rule: str
    fixed_quota: int | None
    status: str
    draw_seed: int | None

    model_config = {"from_attributes": True}


class GalaTableCreate(BaseModel):
    code: str
    name: str | None = None
    x: int = 0
    y: int = 0
    shape: Literal["round", "rect"] = "round"
    seat_count: int = Field(default=8, ge=1)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return code(value, label="Mã bàn", max_length=50, required=True) or ""

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return optional_text(value, label="Tên bàn", max_length=200)


class GalaTableUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    x: int | None = None
    y: int | None = None
    shape: Literal["round", "rect"] | None = None
    seat_count: int | None = Field(default=None, ge=1)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return code(value, label="Mã bàn", max_length=50)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return optional_text(value, label="Tên bàn", max_length=200)


class GalaTableOut(BaseModel):
    id: int
    event_id: int
    code: str
    name: str | None
    x: int
    y: int
    shape: str
    seat_count: int
    is_active: bool

    model_config = {"from_attributes": True}


class GalaSeatOut(BaseModel):
    id: int
    table_id: int
    seat_number: int
    label: str | None
    status: str
    held_by_team_id: int | None
    hold_expires_at: datetime | None
    team_id: int | None
    employee_id: int | None
    version: int

    model_config = {"from_attributes": True}


class GalaSeatBlockIn(BaseModel):
    blocked: bool


class GalaSeatOccupantIn(BaseModel):
    employee_id: int | None


class GalaGrantTurnIn(BaseModel):
    team_id: int


class GalaTurnOut(BaseModel):
    id: int
    team_id: int
    team_name: str | None = None
    order_no: int
    seat_quota: int
    status: str
    started_at: datetime | None
    expires_at: datetime | None
    is_makeup: bool = False
    is_admin_grant: bool = False
    # whether this team has a team_leader account to actually act on this
    # turn — BTC needs to see this *before* starting the turn, not discover
    # it when nobody shows up to pick a seat (BRD §8.4/§16 q.8)
    has_representative: bool = True


class GalaStateOut(BaseModel):
    config: GalaConfigOut | None
    tables: list[GalaTableOut]
    seats: list[GalaSeatOut]
    turns: list[GalaTurnOut]
    my_team_id: int | None
