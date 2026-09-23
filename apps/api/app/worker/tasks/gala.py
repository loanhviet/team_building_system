import logging

from arq import ArqRedis
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.event import Event
from app.models.gala import GalaConfig
from app.services.gala.gala_service import expire_stale, queue_gala_turn_email
from app.services.notification.email_service import dispatch_emails

logger = logging.getLogger("worker")


async def expire_gala_holds_task(ctx: dict) -> None:
    """ARQ cron: runs every few seconds, expires stale seat holds and turns for
    every event currently mid-Gala. A single sweep across events is cheap
    (a handful of rows at most) so no per-event scheduling is needed."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(GalaConfig).where(GalaConfig.status == "in_progress"))
        configs = result.scalars().all()
        if not configs:
            return

        redis: ArqRedis = ctx["redis"]
        outbox_ids: list[int] = []
        for config in configs:
            activated = await expire_stale(db, redis, config.event_id, config)
            if activated is None:
                continue
            event = await db.get(Event, config.event_id)
            if event is None:
                continue
            outbox_ids.extend(
                await queue_gala_turn_email(
                    db, event, activated, opened_by_admin=bool(activated.is_admin_grant)
                )
            )
        await db.commit()
        await dispatch_emails(redis, outbox_ids)
