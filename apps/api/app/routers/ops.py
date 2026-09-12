import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.deps import DbSession, require_admin
from app.models.audit import AuditLog
from app.models.auth import User
from app.schemas.audit import AuditLogOut

router = APIRouter(tags=["ops"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.get("/events/{event_id}/audit-logs", response_model=list[AuditLogOut])
async def list_audit_logs(
    event_id: int, db: DbSession, _user: AdminUser, limit: int = 100
) -> list[AuditLog]:
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.event_id == event_id)
        .order_by(AuditLog.created_at.desc())
        .limit(min(limit, 500))
    )
    return list(result.scalars().all())


@router.get("/events/{event_id}/audit-logs/export")
async def export_audit_logs(
    event_id: int, db: DbSession, _user: AdminUser
) -> StreamingResponse:
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.event_id == event_id)
        .order_by(AuditLog.created_at.desc())
        .limit(2000)
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["created_at", "actor_user_id", "action", "entity_type", "entity_id", "reason"])
    for log in result.scalars().all():
        writer.writerow([
            log.created_at.isoformat() if log.created_at else "",
            log.actor_user_id or "",
            log.action,
            log.entity_type,
            log.entity_id,
            log.reason or "",
        ])
    data = io.BytesIO(buffer.getvalue().encode("utf-8-sig"))
    return StreamingResponse(
        data,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=audit_event_{event_id}.csv"
        },
    )
