from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin
from app.models.organization import Employee

RegistrationStatus = Enum(
    "draft", "submitted", "cancelled", name="registration_status", native_enum=False, length=20
)


class Registration(TimestampMixin, Base):
    __tablename__ = "registrations"
    __table_args__ = (UniqueConstraint("event_id", "employee_id", name="uq_registration_event_employee"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    status: Mapped[str] = mapped_column(RegistrationStatus, default="draft")
    is_participating: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"), nullable=True)
    agreed_terms_at: Mapped[datetime | None] = mapped_column(nullable=True)
    terms_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    wish_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    employee: Mapped[Employee] = relationship(lazy="joined")


class RegistrationTransportNeed(Base):
    __tablename__ = "registration_transport_needs"
    __table_args__ = (UniqueConstraint("registration_id", "leg_id", name="uq_transport_need_reg_leg"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    registration_id: Mapped[int] = mapped_column(ForeignKey("registrations.id"), index=True)
    leg_id: Mapped[int] = mapped_column(ForeignKey("transport_legs.id"))
    is_needed: Mapped[bool] = mapped_column(Boolean, default=False)
    pickup_point_id: Mapped[int | None] = mapped_column(ForeignKey("pickup_points.id"), nullable=True)
