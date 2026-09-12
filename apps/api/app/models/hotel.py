from datetime import date, datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin
from app.models.organization import Employee

RoomAssignmentSource = Enum(
    "manual", "import", name="room_assignment_source", native_enum=False, length=20
)


class Hotel(TimestampMixin, Base):
    __tablename__ = "hotels"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    checkin_date: Mapped[date | None] = mapped_column(nullable=True)
    checkout_date: Mapped[date | None] = mapped_column(nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class RoomType(Base):
    __tablename__ = "room_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    hotel_id: Mapped[int] = mapped_column(ForeignKey("hotels.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    capacity: Mapped[int] = mapped_column(Integer, default=2)
    quantity: Mapped[int] = mapped_column(Integer, default=0)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    hotel_id: Mapped[int] = mapped_column(ForeignKey("hotels.id"), index=True)
    room_type_id: Mapped[int | None] = mapped_column(ForeignKey("room_types.id"), nullable=True)
    room_number: Mapped[str] = mapped_column(String(50))
    capacity: Mapped[int] = mapped_column(Integer, default=2)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class RoomAssignment(Base):
    __tablename__ = "room_assignments"
    __table_args__ = (
        UniqueConstraint("event_id", "employee_id", name="uq_room_assignment_event_employee"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), index=True)
    source: Mapped[str] = mapped_column(RoomAssignmentSource, default="manual")
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(nullable=True)

    employee: Mapped[Employee] = relationship(lazy="joined")
