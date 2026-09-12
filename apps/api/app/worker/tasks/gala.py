import logging

from arq import ArqRedis
from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.gala import GalaConfig
from app.services.gala.gala_service import expire_stale

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
        for config in configs:
            await expire_stale(db, redis, config.event_id, config)
        await db.commit()
