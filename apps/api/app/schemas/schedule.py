from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

from app.schemas.common import optional_text, required_text


def _end_after_start(start_at: datetime | None, end_at: datetime | None) -> None:
    if start_at and end_at and end_at <= start_at:
        raise ValueError("Giờ kết thúc phải sau giờ bắt đầu")


class ScheduleItemCreate(BaseModel):
    day_date: date | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    title: str
    description: str | None = None
    location: str | None = None
    audience: Literal["all", "shift", "team"] = "all"
    audience_ref_id: int | None = None
    sort_order: int = 0
    is_published: bool = False

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return required_text(value, label="Tiêu đề lịch", max_length=200)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return optional_text(value, label="Mô tả lịch", max_length=2000)

    @field_validator("location")
    @classmethod
    def normalize_location(cls, value: str | None) -> str | None:
        return optional_text(value, label="Địa điểm", max_length=200)

    @model_validator(mode="after")
    def times_in_order(self):
        _end_after_start(self.start_at, self.end_at)
        return self


class ScheduleItemUpdate(BaseModel):
    day_date: date | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    title: str | None = None
    description: str | None = None
    location: str | None = None
    audience: Literal["all", "shift", "team"] | None = None
    audience_ref_id: int | None = None
    sort_order: int | None = None
    is_published: bool | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        text = optional_text(value, label="Tiêu đề lịch", max_length=200)
        if value is not None and text is None:
            raise ValueError("Tiêu đề lịch không được để trống")
        return text

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return optional_text(value, label="Mô tả lịch", max_length=2000)

    @field_validator("location")
    @classmethod
    def normalize_location(cls, value: str | None) -> str | None:
        return optional_text(value, label="Địa điểm", max_length=200)

    @model_validator(mode="after")
    def times_in_order(self):
        _end_after_start(self.start_at, self.end_at)
        return self


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

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return required_text(value, label="Tiêu đề thông báo", max_length=200)

    @field_validator("body_md")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        return required_text(value, label="Nội dung thông báo", max_length=5000)


class AnnouncementUpdate(BaseModel):
    title: str | None = None
    body_md: str | None = None
    is_pinned: bool | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        text = optional_text(value, label="Tiêu đề thông báo", max_length=200)
        if value is not None and text is None:
            raise ValueError("Tiêu đề thông báo không được để trống")
        return text

    @field_validator("body_md")
    @classmethod
    def normalize_body(cls, value: str | None) -> str | None:
        text = optional_text(value, label="Nội dung thông báo", max_length=5000)
        if value is not None and text is None:
            raise ValueError("Nội dung thông báo không được để trống")
        return text


class AnnouncementOut(BaseModel):
    id: int
    event_id: int
    title: str
    body_md: str
    is_pinned: bool
    published_at: datetime | None

    model_config = {"from_attributes": True}
