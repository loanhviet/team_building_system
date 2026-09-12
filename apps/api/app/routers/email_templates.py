from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import DbSession, require_admin
from app.models.auth import User
from app.models.event import Event
from app.schemas.notification import EmailTemplateOut, EmailTemplateUpdate
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.notification.email_service import (
    list_templates,
    preview_template,
    restore_default_template,
    upsert_event_template,
)

router = APIRouter(prefix="/events/{event_id}/email-templates", tags=["email-templates"])

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
