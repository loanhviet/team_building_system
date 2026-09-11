import logging

from app.core.time import utcnow
from app.db.session import AsyncSessionLocal
from app.models.enums import ImportBatchStatus, JobStatus
from app.models.system import ImportBatch, Job
from app.services.importer.employee_import import import_employees

logger = logging.getLogger("worker")


async def import_employees_task(ctx: dict, job_id: int, batch_id: int) -> None:
    async with AsyncSessionLocal() as db:
        job = await db.get(Job, job_id)
        batch = await db.get(ImportBatch, batch_id)
        if job is None or batch is None:
            logger.error("import_employees_task: job=%s batch=%s not found", job_id, batch_id)
            return

        job.status = JobStatus.running
        batch.status = ImportBatchStatus.running
        await db.commit()

        try:
            ok_rows, error_rows, errors = await import_employees(db, batch.storage_path)
            batch.total_rows = ok_rows + error_rows
            batch.ok_rows = ok_rows
            batch.error_rows = error_rows
            batch.errors_json = errors
            batch.status = ImportBatchStatus.succeeded
            job.status = JobStatus.succeeded
            job.progress = ok_rows + error_rows
            job.total = ok_rows + error_rows
            job.result_json = {"ok_rows": ok_rows, "error_rows": error_rows}
        except Exception as exc:
            logger.exception("import_employees_task failed")
            batch.status = ImportBatchStatus.failed
            job.status = JobStatus.failed
            job.error = str(exc)

        job.finished_at = utcnow()
        await db.commit()
