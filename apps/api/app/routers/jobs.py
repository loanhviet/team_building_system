from typing import Annotated

from fastapi import APIRouter, Depends

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
    )


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: int, db: DbSession, _user: AdminUser) -> JobOut:
    job = await master_data.get_or_404(db, Job, job_id)
    return _job_out(job)
