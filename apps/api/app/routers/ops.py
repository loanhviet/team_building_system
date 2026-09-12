from typing import Annotated

from fastapi import APIRouter, Depends
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
