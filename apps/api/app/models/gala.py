from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

GalaConfigStatus = Enum(
    "setup", "drawing", "in_progress", "finished", name="gala_config_status",
    native_enum=False, length=20,
)
SeatQuotaRule = Enum(
    "by_team_size", "fixed", name="gala_seat_quota_rule", native_enum=False, length=20
)
TableShape = Enum("round", "rect", name="gala_table_shape", native_enum=False, length=20)
SeatStatus = Enum(
    "available", "held", "confirmed", "blocked", name="gala_seat_status",
    native_enum=False, length=20,
)
TurnStatus = Enum(
    "waiting", "active", "done", "skipped", "expired", name="gala_turn_status",
    native_enum=False, length=20,
)


class GalaConfig(Base):
    __tablename__ = "gala_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    stage_label: Mapped[str] = mapped_column(String(100), default="SÂN KHẤU")
    turn_duration_seconds: Mapped[int] = mapped_column(Integer, default=60)
    hold_ttl_seconds: Mapped[int] = mapped_column(Integer, default=30)
    seat_quota_rule: Mapped[str] = mapped_column(SeatQuotaRule, default="by_team_size")
    fixed_quota: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(GalaConfigStatus, default="setup")
    draw_seed: Mapped[int | None] = mapped_column(Integer, nullable=True)


class GalaTable(Base):
    __tablename__ = "gala_tables"
    __table_args__ = (UniqueConstraint("event_id", "code", name="uq_gala_table_event_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    x: Mapped[int] = mapped_column(Integer, default=0)
    y: Mapped[int] = mapped_column(Integer, default=0)
    shape: Mapped[str] = mapped_column(TableShape, default="round")
    seat_count: Mapped[int] = mapped_column(Integer, default=8)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class GalaSeat(Base):
    __tablename__ = "gala_seats"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("gala_tables.id"), index=True)
    seat_number: Mapped[int] = mapped_column(Integer)
    label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(SeatStatus, default="available")
    held_by_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    hold_expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)


class GalaTurn(Base):
    __tablename__ = "gala_turns"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    order_no: Mapped[int] = mapped_column(Integer)
    seat_quota: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(TurnStatus, default="waiting")
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    # a team whose original turn ran out (expired/skipped) without filling its
    # quota gets exactly one of these, appended to the end of the queue once
    # the normal waiting list is exhausted — see gala_service._spawn_makeup_turns.
    # Without this a team that missed its turn had zero seats, permanently
    # (BRD §8 has no "you're just out of luck" case).
    is_makeup: Mapped[bool] = mapped_column(Boolean, default=False)
    # BTC opened this turn out of order so the team can pick immediately.
    is_admin_grant: Mapped[bool] = mapped_column(Boolean, default=False)
