import logging

from app.core.time import utcnow
from app.db.session import AsyncSessionLocal
from app.models.enums import JobStatus
from app.models.system import AllocationRun, Job
from app.services.allocation.runner import run_flight_allocation

logger = logging.getLogger("worker")


async def run_flight_allocation_task(
    ctx: dict,
    job_id: int,
    allocation_run_id: int,
    event_id: int,
    direction: str,
    weights: dict[str, float] | None,
) -> None:
    async with AsyncSessionLocal() as db:
        job = await db.get(Job, job_id)
        if job is None:
            logger.error("run_flight_allocation_task: job %s not found", job_id)
            return

        job.status = JobStatus.running
        await db.commit()

        try:
            summary = await run_flight_allocation(
                db, event_id, direction, weights, allocation_run_id
            )
            job.status = JobStatus.succeeded
            job.result_json = summary
        except Exception as exc:
            logger.exception("run_flight_allocation_task failed")
            run = await db.get(AllocationRun, allocation_run_id)
            if run is not None:
                run.status = "failed"
            job.status = JobStatus.failed
            job.error = str(exc)

        job.finished_at = utcnow()
        await db.commit()
