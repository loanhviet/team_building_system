from datetime import date, datetime

from pydantic import BaseModel


class ScheduleItemCreate(BaseModel):
    day_date: date | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    title: str
    description: str | None = None
    location: str | None = None
    audience: str = "all"
    audience_ref_id: int | None = None
    sort_order: int = 0
    is_published: bool = False


class ScheduleItemUpdate(BaseModel):
    day_date: date | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    title: str | None = None
    description: str | None = None
    location: str | None = None
    audience: str | None = None
    audience_ref_id: int | None = None
    sort_order: int | None = None
    is_published: bool | None = None


class ScheduleItemOut(BaseModel):
    id: int
    event_id: int
    day_date: date | None
    start_at: datetime | None
    end_at: datetime | None
    title: str
    description: str | None
    location: str | None
    audience: str
    audience_ref_id: int | None
    sort_order: int
    is_published: bool

    model_config = {"from_attributes": True}


class AnnouncementCreate(BaseModel):
    title: str
    body_md: str
    is_pinned: bool = False


class AnnouncementUpdate(BaseModel):
    title: str | None = None
    body_md: str | None = None
    is_pinned: bool | None = None


class AnnouncementOut(BaseModel):
    id: int
    event_id: int
    title: str
    body_md: str
    is_pinned: bool
    published_at: datetime | None

    model_config = {"from_attributes": True}
