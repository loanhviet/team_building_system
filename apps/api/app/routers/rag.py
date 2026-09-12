from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status

from app.core.deps import DbSession, require_admin
from app.core.queue import get_queue
from app.models.auth import User
from app.models.event import Event
from app.services import master_data

router = APIRouter(prefix="/events/{event_id}/rag", tags=["rag"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.post("/reindex", status_code=status.HTTP_202_ACCEPTED)
async def reindex(
    event_id: int,
    db: DbSession,
    _user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> dict:
    await master_data.get_or_404(db, Event, event_id)
    arq_job = await queue.enqueue_job("reindex_rag_task", event_id)
    return {"job_id": arq_job.job_id if arq_job else None}
