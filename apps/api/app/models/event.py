from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import EventStatus
from app.models.mixins import TimestampMixin


class Event(TimestampMixin, Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    start_date: Mapped[date | None] = mapped_column(nullable=True)
    end_date: Mapped[date | None] = mapped_column(nullable=True)
    destination: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus, native_enum=False, validate_strings=True, length=30),
        default=EventStatus.draft,
    )
    registration_open_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    registration_close_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class EventSetting(Base):
    __tablename__ = "event_settings"
    __table_args__ = (UniqueConstraint("event_id", "key", name="uq_event_settings_event_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    key: Mapped[str] = mapped_column(String(100))
    value_json: Mapped[Any] = mapped_column(JSON)


class Shift(Base):
    __tablename__ = "shifts"
    __table_args__ = (UniqueConstraint("event_id", "code", name="uq_shifts_event_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    depart_after_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TransportLeg(Base):
    __tablename__ = "transport_legs"
    __table_args__ = (UniqueConstraint("event_id", "code", name="uq_transport_legs_event_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(200))
    direction: Mapped[str] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # "before_flight" (this leg feeds a departure — airport-bound) or
    # "after_flight" (this leg starts from arrival — hotel-bound); null = no
    # flight relationship (e.g. a leg that never touches an airport). Drives
    # bus_greedy's timing window — see services/allocation/bus_greedy.py
    flight_timing: Mapped[str | None] = mapped_column(String(20), nullable=True)


class PickupPoint(Base):
    __tablename__ = "pickup_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True)
    # workplace: đón lúc đi, gắn site nơi làm việc.
    # venue: khách sạn / sân chơi, dùng cho chiều về.
    kind: Mapped[str] = mapped_column(String(20), default="workplace")
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
