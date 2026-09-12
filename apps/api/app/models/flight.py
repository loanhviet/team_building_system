from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin
from app.models.organization import Employee

FlightDirection = Enum(
    "outbound", "inbound", name="flight_direction", native_enum=False, length=20
)
AssignmentSource = Enum(
    "auto", "manual", "import", name="assignment_source", native_enum=False, length=20
)


class Flight(TimestampMixin, Base):
    __tablename__ = "flights"
    __table_args__ = (UniqueConstraint("event_id", "flight_code", name="uq_flight_event_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    flight_code: Mapped[str] = mapped_column(String(50))
    airline: Mapped[str | None] = mapped_column(String(100), nullable=True)
    direction: Mapped[str] = mapped_column(FlightDirection)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"), nullable=True)
    depart_at: Mapped[datetime | None] = mapped_column(nullable=True)
    arrive_at: Mapped[datetime | None] = mapped_column(nullable=True)
    origin: Mapped[str | None] = mapped_column(String(100), nullable=True)
    destination: Mapped[str | None] = mapped_column(String(100), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class FlightAssignment(Base):
    __tablename__ = "flight_assignments"
    __table_args__ = (
        UniqueConstraint("event_id", "employee_id", "direction", name="uq_flight_assignment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    flight_id: Mapped[int | None] = mapped_column(ForeignKey("flights.id"), index=True, nullable=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    direction: Mapped[str] = mapped_column(FlightDirection)
    source: Mapped[str] = mapped_column(AssignmentSource, default="auto")
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(nullable=True)

    employee: Mapped[Employee] = relationship(lazy="joined")
