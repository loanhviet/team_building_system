import logging

from app.core.time import utcnow
from app.db.session import AsyncSessionLocal
from app.models.enums import JobStatus
from app.models.system import AllocationRun, Job
from app.services.allocation.bus_runner import run_bus_allocation

logger = logging.getLogger("worker")


async def run_bus_allocation_task(
    ctx: dict, job_id: int, allocation_run_id: int, event_id: int, leg_id: int
) -> None:
    async with AsyncSessionLocal() as db:
        job = await db.get(Job, job_id)
        if job is None:
            logger.error("run_bus_allocation_task: job %s not found", job_id)
            return

        job.status = JobStatus.running
        await db.commit()

        try:
            summary = await run_bus_allocation(db, event_id, leg_id, allocation_run_id)
            job.status = JobStatus.succeeded
            job.result_json = summary
        except Exception as exc:
            logger.exception("run_bus_allocation_task failed")
            run = await db.get(AllocationRun, allocation_run_id)
            if run is not None:
                run.status = "failed"
            job.status = JobStatus.failed
            job.error = str(exc)

        job.finished_at = utcnow()
        await db.commit()
