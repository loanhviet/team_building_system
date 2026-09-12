from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.auth import User
from app.models.enums import EventStatus, UserRole
from app.models.event import Event
from app.models.registration import Registration


async def event_for_chat(db: AsyncSession, user: User, event_id: int) -> Event:
    """Resolve the event a chat session may attach to.

    Admins may use any event. A CBNV may chat about an event they have a
    registration row for, or about the currently-open registration event
    (so they can ask about terms before submitting).
    """
    event = await db.get(Event, event_id)
    if event is None:
        raise AppError("not_found", "Sự kiện không tồn tại", status.HTTP_404_NOT_FOUND)

    if user.role in (UserRole.organizer, UserRole.super_admin):
        return event

    if user.employee_id is None:
        raise AppError(
            "forbidden",
            "Tài khoản không gắn với CBNV nên không dùng được hỏi đáp",
            status.HTTP_403_FORBIDDEN,
        )

    result = await db.execute(
        select(Registration.id).where(
            Registration.event_id == event_id,
            Registration.employee_id == user.employee_id,
        ).limit(1)
    )
    if result.scalar_one_or_none() is not None:
        return event

    if event.status == EventStatus.registration_open:
        return event

    raise AppError(
        "forbidden",
        "Bạn không thuộc sự kiện này",
        status.HTTP_403_FORBIDDEN,
    )
