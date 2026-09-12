from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import get_client_ip
from app.models.audit import AuditLog


async def record_audit(
    db: AsyncSession,
    *,
    actor_user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: str | int,
    before: dict | None = None,
    after: dict | None = None,
    reason: str | None = None,
    event_id: int | None = None,
) -> None:
    # `ip` comes from the request-scoped contextvar set by main.py's
    # capture_client_ip middleware, not a parameter — every call site logging
    # an HTTP-triggered action gets it for free; a worker-task caller (no
    # request in flight) just gets None, which is correct for it too.
    db.add(
        AuditLog(
            event_id=event_id,
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            before_json=before,
            after_json=after,
            reason=reason,
            ip=get_client_ip(),
        )
    )
