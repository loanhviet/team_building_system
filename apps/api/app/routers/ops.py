import csv
import io
import json
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, select

from app.core.deps import DbSession, require_admin
from app.models.audit import AuditLog
from app.models.auth import User
from app.schemas.audit import AuditLogOut

router = APIRouter(tags=["ops"])

AdminUser = Annotated[User, Depends(require_admin)]


def _filtered_query(
    event_id: int,
    action: str | None,
    entity_type: str | None,
    since: datetime | None,
    until: datetime | None,
) -> Select:
    stmt = select(AuditLog).where(AuditLog.event_id == event_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if since:
        stmt = stmt.where(AuditLog.created_at >= since)
    if until:
        stmt = stmt.where(AuditLog.created_at <= until)
    return stmt.order_by(AuditLog.created_at.desc())


@router.get("/events/{event_id}/audit-logs", response_model=list[AuditLogOut])
async def list_audit_logs(
    event_id: int,
    db: DbSession,
    _user: AdminUser,
    limit: int = 100,
    action: str | None = None,
    entity_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> list[AuditLog]:
    stmt = _filtered_query(event_id, action, entity_type, since, until).limit(min(limit, 500))
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/events/{event_id}/audit-logs/export")
async def export_audit_logs(
    event_id: int,
    db: DbSession,
    _user: AdminUser,
    action: str | None = None,
    entity_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> StreamingResponse:
    stmt = _filtered_query(event_id, action, entity_type, since, until).limit(2000)
    result = await db.execute(stmt)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["created_at", "actor_email", "action", "entity_type", "entity_id", "reason", "before", "after"]
    )
    for log in result.scalars().all():
        writer.writerow([
            log.created_at.isoformat() if log.created_at else "",
            log.actor_email or "",
            log.action,
            log.entity_type,
            log.entity_id,
            log.reason or "",
            json.dumps(log.before_json, ensure_ascii=False) if log.before_json else "",
            json.dumps(log.after_json, ensure_ascii=False) if log.after_json else "",
        ])
    data = io.BytesIO(buffer.getvalue().encode("utf-8-sig"))
    return StreamingResponse(
        data,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=audit_event_{event_id}.csv"
        },
    )
