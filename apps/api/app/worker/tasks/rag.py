import asyncio
import logging
from collections import defaultdict

from app.core.time import utcnow
from app.db.session import AsyncSessionLocal
from app.models.enums import JobStatus
from app.models.system import Job
from app.services.rag.reindex import reindex_event

logger = logging.getLogger("worker")

# ponytail: in-process lock keyed by event_id — enough because ARQ runs this
# worker as a single process. Two workers reindexing the same event at once
# would still race on rag_chunks/FTS rowids; move to a Redis lock if the
# worker is ever scaled beyond one instance.
_event_locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)


async def reindex_rag_task(ctx: dict, event_id: int, job_id: int | None = None) -> dict:
    async with _event_locks[event_id], AsyncSessionLocal() as db:
        job = await db.get(Job, job_id) if job_id is not None else None
        if job is not None:
            job.status = JobStatus.running
            await db.commit()
        try:
            summary = await reindex_event(db, event_id)
        except Exception as exc:
            logger.exception("reindex_rag_task failed for event %s", event_id)
            if job is not None:
                job = await db.get(Job, job_id)
                if job is not None:
                    job.status = JobStatus.failed
                    job.error = str(exc)[:2000]
                    job.finished_at = utcnow()
                    await db.commit()
            raise
        if job is not None:
            job = await db.get(Job, job_id)
            if job is not None:
                job.status = JobStatus.succeeded
                job.result_json = summary
                job.finished_at = utcnow()
                await db.commit()
        logger.info("reindex_rag_task: event %s -> %s", event_id, summary)
        return summary
