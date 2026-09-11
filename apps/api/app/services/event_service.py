from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.time import utcnow
from app.models.enums import EventStatus, UserRole
from app.models.event import Event, EventSetting

FORWARD_TRANSITIONS: dict[EventStatus, set[EventStatus]] = {
    EventStatus.draft: {EventStatus.registration_open},
    EventStatus.registration_open: {EventStatus.registration_closed},
    EventStatus.registration_closed: {
        EventStatus.allocation_processing,
        EventStatus.registration_open,
    },
    EventStatus.allocation_processing: {
        EventStatus.information_published,
        EventStatus.registration_closed,
    },
    EventStatus.information_published: {EventStatus.event_started},
    EventStatus.event_started: {EventStatus.event_completed},
    EventStatus.event_completed: set(),
}


def transition_event(event: Event, new_status: EventStatus, actor_role: UserRole) -> None:
    if new_status == event.status:
        raise AppError("no_op", "Event đã ở trạng thái này", status.HTTP_400_BAD_REQUEST)

    is_forward_allowed = new_status in FORWARD_TRANSITIONS.get(event.status, set())
    if not is_forward_allowed and actor_role != UserRole.super_admin:
        raise AppError(
            "invalid_transition",
            f"Không thể chuyển từ '{event.status.value}' sang '{new_status.value}'. "
            "Chỉ Super Admin mới được ghi đè trạng thái ngoài luồng chuẩn.",
            status.HTTP_400_BAD_REQUEST,
        )

    event.status = new_status
    if new_status == EventStatus.information_published and event.published_at is None:
        event.published_at = utcnow()


async def get_setting(db: AsyncSession, event_id: int, key: str, default: str) -> str:
    result = await db.execute(
        select(EventSetting.value_json).where(
            EventSetting.event_id == event_id, EventSetting.key == key
        )
    )
    value = result.scalar_one_or_none()
    return value if value is not None else default
