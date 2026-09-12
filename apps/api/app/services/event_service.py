from typing import Any

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.time import utcnow
from app.models.enums import EventStatus, UserRole
from app.models.event import Event, EventSetting
from app.services.allocation.base import DEFAULT_WEIGHTS

DEFAULT_TERMS_TEXT = (
    "Tôi xác nhận đã đọc và đồng ý với quy định chương trình Team Building, "
    "bao gồm chính sách/phí phạt trong trường hợp huỷ đăng ký không đúng quy định."
)
DEFAULT_TERMS_VERSION = "v1"

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


async def get_setting(db: AsyncSession, event_id: int, key: str, default: Any) -> Any:
    result = await db.execute(
        select(EventSetting.value_json).where(
            EventSetting.event_id == event_id, EventSetting.key == key
        )
    )
    value = result.scalar_one_or_none()
    return default if value is None else value


async def upsert_setting(db: AsyncSession, event_id: int, key: str, value: Any) -> None:
    result = await db.execute(
        select(EventSetting).where(EventSetting.event_id == event_id, EventSetting.key == key)
    )
    row = result.scalar_one_or_none()
    if row is None:
        db.add(EventSetting(event_id=event_id, key=key, value_json=value))
    else:
        row.value_json = value


async def get_event_settings(db: AsyncSession, event_id: int) -> dict[str, Any]:
    terms_text = await get_setting(db, event_id, "terms_text", DEFAULT_TERMS_TEXT)
    terms_version = await get_setting(db, event_id, "terms_version", DEFAULT_TERMS_VERSION)
    weights = await get_setting(db, event_id, "flight_allocation_weights", {})
    if not isinstance(weights, dict):
        weights = {}
    return {
        "terms_text": terms_text if isinstance(terms_text, str) else DEFAULT_TERMS_TEXT,
        "terms_version": terms_version if isinstance(terms_version, str) else DEFAULT_TERMS_VERSION,
        "flight_allocation_weights": {**DEFAULT_WEIGHTS, **weights},
    }


async def save_event_settings(
    db: AsyncSession,
    event_id: int,
    *,
    terms_text: str | None = None,
    terms_version: str | None = None,
    flight_allocation_weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    if terms_text is not None:
        await upsert_setting(db, event_id, "terms_text", terms_text)
    if terms_version is not None:
        await upsert_setting(db, event_id, "terms_version", terms_version)
    if flight_allocation_weights is not None:
        await upsert_setting(db, event_id, "flight_allocation_weights", flight_allocation_weights)
    return await get_event_settings(db, event_id)
