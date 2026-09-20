import io
from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook

from app.core.deps import CurrentUser, DbSession, require_admin
from app.core.queue import get_queue
from app.core.time import utcnow
from app.models.auth import User
from app.models.enums import UserRole
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
from app.services.event_service import assert_event_not_completed
from app.services.notification.email_service import enqueue_schedule_changed
from app.services.rag.enqueue import enqueue_reindex_fire_and_forget

router = APIRouter(prefix="/events/{event_id}", tags=["schedule"])

AdminUser = Annotated[User, Depends(require_admin)]


def _is_admin(user: User) -> bool:
    return user.role in (UserRole.organizer, UserRole.super_admin)


@router.get("/schedule-items", response_model=list[ScheduleItemOut])
async def list_schedule_items(event_id: int, db: DbSession, user: CurrentUser) -> list[ScheduleItem]:
    items = await master_data.list_all(
        db, ScheduleItem, event_id=event_id, order_by=ScheduleItem.sort_order
    )
    # BTC needs to see drafts to edit them; everyone else only sees what's published
    # (this mirrors journey_service's filter — that's the endpoint CBNV actually
    # use, but this generic list shouldn't leak drafts to a direct API call either)
    if not _is_admin(user):
        items = [i for i in items if i.is_published]
    return items


@router.get("/schedule-items/export")
async def export_schedule_items(
    event_id: int, db: DbSession, _user: AdminUser
) -> StreamingResponse:
    items = await master_data.list_all(
        db, ScheduleItem, event_id=event_id, order_by=ScheduleItem.sort_order
    )
    wb = Workbook()
    ws = wb.active
    ws.title = "Lịch trình"
    ws.append(["Ngày", "Bắt đầu", "Kết thúc", "Tiêu đề", "Địa điểm", "Đối tượng", "Công bố", "Mô tả"])
    for item in items:
        ws.append([
            str(item.day_date or ""),
            item.start_at.isoformat(sep=" ", timespec="minutes") if item.start_at else "",
            item.end_at.isoformat(sep=" ", timespec="minutes") if item.end_at else "",
            item.title,
            item.location or "",
            item.audience,
            "Có" if item.is_published else "Nháp",
            item.description or "",
        ])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="schedule_event_{event_id}.xlsx"'},
    )


@router.post("/schedule-items", response_model=ScheduleItemOut, status_code=status.HTTP_201_CREATED)
async def create_schedule_item(
    event_id: int,
    payload: ScheduleItemCreate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> ScheduleItem:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    item = await master_data.create(db, ScheduleItem, payload.model_dump(), event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="schedule_item", entity_id=item.id,
        after=payload.model_dump(mode="json"), event_id=event_id,
    )
    await enqueue_schedule_changed(queue, event, item.id, item.is_published)
    await db.commit()
    await enqueue_reindex_fire_and_forget(queue, event_id)
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
    assert_event_not_completed(event)
    item = await master_data.get_or_404(db, ScheduleItem, item_id, event_id=event_id)
    before = ScheduleItemOut.model_validate(item).model_dump(mode="json")
    await master_data.update(db, item, payload.model_dump(exclude_unset=True))
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="schedule_item", entity_id=item_id,
        before=before, after=ScheduleItemOut.model_validate(item).model_dump(mode="json"),
        event_id=event_id,
    )
    # Notify on edits to an already-visible item and when a draft is made
    # visible. Editing a draft must remain internal to BTC.
    await enqueue_schedule_changed(queue, event, item.id, before["is_published"] or item.is_published)
    await db.commit()
    await enqueue_reindex_fire_and_forget(queue, event_id)
    await db.refresh(item)
    return item


@router.delete("/schedule-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_item(
    event_id: int,
    item_id: int,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> None:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    item = await master_data.get_or_404(db, ScheduleItem, item_id, event_id=event_id)
    was_visible_to_employees = item.is_published
    await db.delete(item)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="schedule_item", entity_id=item_id,
        event_id=event_id,
    )
    await enqueue_schedule_changed(queue, event, item_id, was_visible_to_employees)
    await db.commit()
    await enqueue_reindex_fire_and_forget(queue, event_id)


@router.get("/announcements", response_model=list[AnnouncementOut])
async def list_announcements(event_id: int, db: DbSession, user: CurrentUser) -> list[Announcement]:
    result = await master_data.list_all(db, Announcement, event_id=event_id)
    if not _is_admin(user):
        result = [a for a in result if a.published_at is not None]
    return sorted(result, key=lambda a: (not a.is_pinned, a.id), reverse=False)


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    event_id: int,
    payload: AnnouncementCreate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
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
    await enqueue_reindex_fire_and_forget(queue, event_id)
    await db.refresh(announcement)
    return announcement


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementOut)
async def update_announcement(
    event_id: int,
    announcement_id: int,
    payload: AnnouncementUpdate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
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
    await enqueue_reindex_fire_and_forget(queue, event_id)
    await db.refresh(announcement)
    return announcement


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    event_id: int,
    announcement_id: int,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> None:
    announcement = await master_data.get_or_404(db, Announcement, announcement_id, event_id=event_id)
    await db.delete(announcement)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="announcement",
        entity_id=announcement_id, event_id=event_id,
    )
    await db.commit()
    await enqueue_reindex_fire_and_forget(queue, event_id)
