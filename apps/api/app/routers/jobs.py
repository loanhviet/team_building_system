from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.deps import DbSession, require_admin
from app.models.auth import User
from app.models.system import Job
from app.schemas.system import JobOut
from app.services import master_data

router = APIRouter(prefix="/jobs", tags=["jobs"])

AdminUser = Annotated[User, Depends(require_admin)]


def _job_out(job: Job) -> JobOut:
    return JobOut(
        id=job.id,
        type=job.type,
        status=job.status.value,
        progress=job.progress,
        total=job.total,
        result_json=job.result_json,
        error=job.error,
        created_at=job.created_at,
        finished_at=job.finished_at,
        event_id=(job.params_json or {}).get("event_id"),
    )


@router.get("", response_model=list[JobOut])
async def list_jobs(
    db: DbSession, _user: AdminUser, limit: int = 50, event_id: int | None = None
) -> list[JobOut]:
    stmt = select(Job).order_by(Job.created_at.desc())
    if event_id is not None:
        # event_id lives inside params_json (jobs aren't all event-scoped —
        # e.g. employee import is global), so filter via SQLite's json_extract
        # rather than adding a column only some job types would ever populate.
        stmt = stmt.where(func.json_extract(Job.params_json, "$.event_id") == event_id)
    result = await db.execute(stmt.limit(min(limit, 200)))
    return [_job_out(j) for j in result.scalars().all()]


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: int, db: DbSession, _user: AdminUser) -> JobOut:
    job = await master_data.get_or_404(db, Job, job_id)
    return _job_out(job)
