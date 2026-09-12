from datetime import date, datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

ScheduleAudience = Enum(
    "all", "shift", "team", name="schedule_audience", native_enum=False, length=20
)


class ScheduleItem(Base):
    __tablename__ = "schedule_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    day_date: Mapped[date | None] = mapped_column(nullable=True)
    start_at: Mapped[datetime | None] = mapped_column(nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    audience: Mapped[str] = mapped_column(ScheduleAudience, default="all")
    audience_ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body_md: Mapped[str] = mapped_column(String(5000))
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
