from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.time import utcnow
from app.models.auth import User
from app.models.event import Event
from app.models.notification import EmailOutbox
from app.schemas.notification import EmailOutboxOut, EmailTemplateOut, EmailTemplateUpdate
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.notification.email_service import (
    dispatch_email,
    enqueue_email,
    list_templates,
    preview_template,
    restore_default_template,
    upsert_event_template,
)

router = APIRouter(prefix="/events/{event_id}/email-templates", tags=["email-templates"])
outbox_router = APIRouter(prefix="/events/{event_id}/email-outbox", tags=["email-outbox"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.get("", response_model=list[EmailTemplateOut])
async def get_templates(event_id: int, db: DbSession, _user: AdminUser) -> list[EmailTemplateOut]:
    await master_data.get_or_404(db, Event, event_id)
    rows = await list_templates(db, event_id)
    return [EmailTemplateOut(**row) for row in rows]


@router.put("/{code}", response_model=EmailTemplateOut)
async def put_template(
    event_id: int, code: str, payload: EmailTemplateUpdate, db: DbSession, user: AdminUser
) -> EmailTemplateOut:
    await master_data.get_or_404(db, Event, event_id)
    row = await upsert_event_template(db, event_id, code, payload.subject, payload.body_html)
    await record_audit(
        db,
        actor_user_id=user.id,
        action="update",
        entity_type="email_template",
        entity_id=code,
        after=row,
        event_id=event_id,
    )
    await db.commit()
    return EmailTemplateOut(**row)


@router.delete("/{code}", response_model=EmailTemplateOut)
async def delete_template(event_id: int, code: str, db: DbSession, user: AdminUser) -> EmailTemplateOut:
    """Restores the built-in default by dropping this event's override."""
    await master_data.get_or_404(db, Event, event_id)
    row = await restore_default_template(db, event_id, code)
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="email_template", entity_id=code,
        after=row, event_id=event_id,
    )
    await db.commit()
    return EmailTemplateOut(**row)


class EmailPreviewRequest(BaseModel):
    subject: str
    body_html: str


class EmailPreviewOut(BaseModel):
    subject: str
    body_html: str


@router.post("/{code}/preview", response_model=EmailPreviewOut)
async def preview_template_endpoint(
    event_id: int, code: str, payload: EmailPreviewRequest, db: DbSession, _user: AdminUser
) -> EmailPreviewOut:
    await master_data.get_or_404(db, Event, event_id)
    subject, body_html = preview_template(payload.subject, payload.body_html)
    return EmailPreviewOut(subject=subject, body_html=body_html)


@router.post("/{code}/test", status_code=status.HTTP_202_ACCEPTED)
async def send_test_email(
    event_id: int,
    code: str,
    payload: EmailPreviewRequest,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> dict:
    """Gửi 1 email thử tới tài khoản BTC đang đăng nhập, dùng nội dung editor (kể cả chưa lưu)."""
    await master_data.get_or_404(db, Event, event_id)
    if not user.email:
        raise AppError("no_email", "Tài khoản BTC không có email để nhận thư thử", status.HTTP_400_BAD_REQUEST)
    subject, body_html = preview_template(payload.subject, payload.body_html)
    outbox_id = await enqueue_email(
        db,
        event_id=event_id,
        to_email=user.email,
        template_code=code,
        payload={
            "_rendered_subject": f"[TEST] {subject}",
            "_rendered_html": body_html,
        },
        dedupe_key=f"email_test:{event_id}:{user.id}:{code}:{utcnow().isoformat()}",
    )
    await record_audit(
        db,
        actor_user_id=user.id,
        action="test_send",
        entity_type="email_template",
        entity_id=code,
        after={"test_to": user.email},
        event_id=event_id,
    )
    await db.commit()
    await dispatch_email(queue, outbox_id)
    return {"to": user.email}


@outbox_router.get("", response_model=list[EmailOutboxOut])
async def list_outbox(
    event_id: int,
    db: DbSession,
    _user: AdminUser,
    status_filter: str | None = None,
    template_code: str | None = None,
) -> list[EmailOutbox]:
    """Nhật ký gửi — trước R7 một mail kẹt `queued`/`failed` vô hình với BTC,
    không có cách xem hay gửi lại."""
    await master_data.get_or_404(db, Event, event_id)
    stmt = select(EmailOutbox).where(EmailOutbox.event_id == event_id)
    if status_filter:
        stmt = stmt.where(EmailOutbox.status == status_filter)
    if template_code:
        stmt = stmt.where(EmailOutbox.template_code == template_code)
    result = await db.execute(stmt.order_by(EmailOutbox.created_at.desc()).limit(500))
    return list(result.scalars().all())


@outbox_router.post("/{outbox_id}/retry", response_model=EmailOutboxOut)
async def retry_outbox(
    event_id: int,
    outbox_id: int,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> EmailOutbox:
    outbox = await db.get(EmailOutbox, outbox_id)
    if outbox is None or outbox.event_id != event_id:
        raise AppError("not_found", "Không tìm thấy email trong nhật ký", status.HTTP_404_NOT_FOUND)
    if outbox.status == "sent":
        raise AppError("already_sent", "Email này đã gửi thành công, không cần gửi lại", status.HTTP_400_BAD_REQUEST)
    outbox.status = "queued"
    outbox.attempts = 0
    outbox.last_error = None
    await record_audit(
        db, actor_user_id=user.id, action="retry", entity_type="email_outbox", entity_id=outbox_id,
        event_id=event_id,
    )
    await db.commit()
    await dispatch_email(queue, outbox_id)
    await db.refresh(outbox)
    return outbox
