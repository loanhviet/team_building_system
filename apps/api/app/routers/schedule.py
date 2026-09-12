from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, DbSession, require_admin
from app.core.queue import get_queue
from app.core.time import utcnow
from app.models.auth import User
from app.models.event import Event
from app.models.schedule import Announcement, ScheduleItem
from app.schemas.schedule import (
    AnnouncementCreate,
    AnnouncementOut,
    AnnouncementUpdate,
    ScheduleItemCreate,
    ScheduleItemOut,
    ScheduleItemUpdate,
)
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.notification.email_service import enqueue_schedule_changed

router = APIRouter(prefix="/events/{event_id}", tags=["schedule"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.get("/schedule-items", response_model=list[ScheduleItemOut])
async def list_schedule_items(event_id: int, db: DbSession, _user: CurrentUser) -> list[ScheduleItem]:
    return await master_data.list_all(db, ScheduleItem, event_id=event_id, order_by=ScheduleItem.sort_order)


@router.post("/schedule-items", response_model=ScheduleItemOut, status_code=status.HTTP_201_CREATED)
async def create_schedule_item(
    event_id: int,
    payload: ScheduleItemCreate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> ScheduleItem:
    event = await master_data.get_or_404(db, Event, event_id)
    item = await master_data.create(db, ScheduleItem, payload.model_dump(), event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="schedule_item", entity_id=item.id,
        after=payload.model_dump(mode="json"), event_id=event_id,
    )
    await enqueue_schedule_changed(queue, event, item.id)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/schedule-items/{item_id}", response_model=ScheduleItemOut)
async def update_schedule_item(
    event_id: int,
    item_id: int,
    payload: ScheduleItemUpdate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> ScheduleItem:
    event = await master_data.get_or_404(db, Event, event_id)
    item = await master_data.get_or_404(db, ScheduleItem, item_id, event_id=event_id)
    before = ScheduleItemOut.model_validate(item).model_dump(mode="json")
    await master_data.update(db, item, payload.model_dump(exclude_unset=True))
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="schedule_item", entity_id=item_id,
        before=before, after=ScheduleItemOut.model_validate(item).model_dump(mode="json"),
        event_id=event_id,
    )
    await enqueue_schedule_changed(queue, event, item.id)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements(event_id: int, db: DbSession, _user: CurrentUser) -> list[Announcement]:
    result = await master_data.list_all(db, Announcement, event_id=event_id)
    return sorted(result, key=lambda a: (not a.is_pinned, a.id), reverse=False)


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    event_id: int, payload: AnnouncementCreate, db: DbSession, user: AdminUser
) -> Announcement:
    data = payload.model_dump()
    data["published_at"] = utcnow()
    data["created_by"] = user.id
    announcement = await master_data.create(db, Announcement, data, event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="announcement",
        entity_id=announcement.id, after=payload.model_dump(mode="json"), event_id=event_id,
    )
    await db.commit()
    await db.refresh(announcement)
    return announcement


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementOut)
async def update_announcement(
    event_id: int, announcement_id: int, payload: AnnouncementUpdate, db: DbSession, user: AdminUser
) -> Announcement:
    announcement = await master_data.get_or_404(db, Announcement, announcement_id, event_id=event_id)
    before = AnnouncementOut.model_validate(announcement).model_dump(mode="json")
    await master_data.update(db, announcement, payload.model_dump(exclude_unset=True))
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="announcement",
        entity_id=announcement_id, before=before,
        after=AnnouncementOut.model_validate(announcement).model_dump(mode="json"), event_id=event_id,
    )
    await db.commit()
    await db.refresh(announcement)
    return announcement
