import logging

from app.db.session import AsyncSessionLocal
from app.services.rag.reindex import reindex_event

logger = logging.getLogger("worker")


async def reindex_rag_task(ctx: dict, event_id: int) -> dict:
    async with AsyncSessionLocal() as db:
        summary = await reindex_event(db, event_id)
        logger.info("reindex_rag_task: event %s -> %s", event_id, summary)
        return summary
