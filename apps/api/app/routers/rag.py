from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status

from app.core.deps import DbSession, require_admin
from app.core.queue import get_queue
from app.models.auth import User
from app.models.event import Event
from app.services import master_data
from app.services.rag.enqueue import create_reindex_job, start_reindex_job

router = APIRouter(prefix="/events/{event_id}/rag", tags=["rag"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.post("/reindex", status_code=status.HTTP_202_ACCEPTED)
async def reindex(
    event_id: int,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> dict:
    await master_data.get_or_404(db, Event, event_id)
    job = await create_reindex_job(db, event_id, user.id)
    await db.commit()
    arq_id = await start_reindex_job(queue, event_id, job.id)
    if arq_id:
        job.arq_job_id = arq_id
        await db.commit()
    return {"job_id": job.id}
