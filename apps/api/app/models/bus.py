from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin
from app.models.organization import Employee

BusAssignmentSource = Enum(
    "auto", "manual", "import", name="bus_assignment_source", native_enum=False, length=20
)


class Bus(TimestampMixin, Base):
    __tablename__ = "buses"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    leg_id: Mapped[int] = mapped_column(ForeignKey("transport_legs.id"), index=True)
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=0)
    gather_at: Mapped[datetime | None] = mapped_column(nullable=True)
    depart_at: Mapped[datetime | None] = mapped_column(nullable=True)
    pickup_point_id: Mapped[int | None] = mapped_column(ForeignKey("pickup_points.id"), nullable=True)
    destination: Mapped[str | None] = mapped_column(String(200), nullable=True)
    leader_employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    leader_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    leader_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class BusAssignment(Base):
    __tablename__ = "bus_assignments"
    __table_args__ = (
        UniqueConstraint("event_id", "employee_id", "leg_id", name="uq_bus_assignment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    leg_id: Mapped[int] = mapped_column(ForeignKey("transport_legs.id"), index=True)
    bus_id: Mapped[int | None] = mapped_column(ForeignKey("buses.id"), index=True, nullable=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    source: Mapped[str] = mapped_column(BusAssignmentSource, default="auto")
    # not in docs/PLAN.md §5.5's original table — added for the same reason flight_assignments
    # needed them (Phase 3): without is_locked, every auto-run would blow away manual pins; without
    # is_flagged, unplaceable people vanish instead of showing up for BTC to handle.
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(nullable=True)

    employee: Mapped[Employee] = relationship(lazy="joined")
