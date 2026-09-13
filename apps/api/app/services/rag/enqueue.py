from arq import ArqRedis
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import JobStatus
from app.models.system import Job


async def create_reindex_job(
    db: AsyncSession, event_id: int, created_by: int | None = None
) -> Job:
    job = Job(
        type="rag_reindex",
        status=JobStatus.queued,
        params_json={"event_id": event_id},
        created_by=created_by,
    )
    db.add(job)
    await db.flush()
    return job


async def start_reindex_job(queue: ArqRedis, event_id: int, job_id: int) -> str | None:
    arq_job = await queue.enqueue_job("reindex_rag_task", event_id, job_id)
    return arq_job.job_id if arq_job is not None else None


async def enqueue_reindex_fire_and_forget(queue: ArqRedis, event_id: int) -> None:
    """Used from existing write paths (publish announcement, save terms)."""
    await queue.enqueue_job("reindex_rag_task", event_id)
