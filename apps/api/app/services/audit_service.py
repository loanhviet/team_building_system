from sqlalchemy.ext.asyncio import AsyncSession

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
        )
    )
