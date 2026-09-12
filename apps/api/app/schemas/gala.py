from datetime import datetime

from pydantic import BaseModel


class GalaConfigIn(BaseModel):
    name: str
    stage_label: str = "SÂN KHẤU"
    turn_duration_seconds: int = 60
    hold_ttl_seconds: int = 30
    seat_quota_rule: str = "by_team_size"
    fixed_quota: int | None = None


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
    shape: str = "round"
    seat_count: int = 8


class GalaTableUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    x: int | None = None
    y: int | None = None
    shape: str | None = None
    seat_count: int | None = None
    is_active: bool | None = None


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
    team_id: int | None
    version: int

    model_config = {"from_attributes": True}


class GalaSeatBlockIn(BaseModel):
    blocked: bool


class GalaTurnOut(BaseModel):
    id: int
    team_id: int
    team_name: str | None = None
    order_no: int
    seat_quota: int
    status: str
    started_at: datetime | None
    expires_at: datetime | None


class GalaStateOut(BaseModel):
    config: GalaConfigOut | None
    tables: list[GalaTableOut]
    seats: list[GalaSeatOut]
    turns: list[GalaTurnOut]
    my_team_id: int | None
