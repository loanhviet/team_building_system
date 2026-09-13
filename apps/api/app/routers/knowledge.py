from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status

from app.core.deps import DbSession, require_admin
from app.core.queue import get_queue
from app.core.time import utcnow
from app.models.auth import User
from app.models.event import Event
from app.models.rag import KnowledgeDocument
from app.schemas.knowledge import (
    KnowledgeCopyOut,
    KnowledgeDocumentCreate,
    KnowledgeDocumentOut,
    KnowledgeDocumentUpdate,
)
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.event_service import assert_event_not_completed
from app.services.rag.enqueue import create_reindex_job, start_reindex_job
from app.services.rag.knowledge_service import copy_knowledge

router = APIRouter(prefix="/events/{event_id}/knowledge", tags=["knowledge"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.get("", response_model=list[KnowledgeDocumentOut])
async def list_knowledge(event_id: int, db: DbSession, _user: AdminUser) -> list[KnowledgeDocument]:
    await master_data.get_or_404(db, Event, event_id)
    return await master_data.list_all(
        db, KnowledgeDocument, event_id=event_id, order_by=KnowledgeDocument.id
    )


@router.post("", response_model=KnowledgeDocumentOut, status_code=status.HTTP_201_CREATED)
async def create_knowledge(
    event_id: int,
    payload: KnowledgeDocumentCreate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> KnowledgeDocument:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    doc = await master_data.create(
        db,
        KnowledgeDocument,
        {**payload.model_dump(), "updated_by": user.id},
        event_id=event_id,
    )
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="knowledge_document",
        entity_id=doc.id, after=payload.model_dump(mode="json"), event_id=event_id,
    )
    job = None
    if doc.is_published:
        job = await create_reindex_job(db, event_id, user.id)
    await db.commit()
    if job is not None:
        await start_reindex_job(queue, event_id, job.id)
    await db.refresh(doc)
    return doc


@router.post(
    "/copy-from/{source_event_id}",
    response_model=KnowledgeCopyOut,
    status_code=status.HTTP_201_CREATED,
)
async def copy_from_event(
    event_id: int, source_event_id: int, db: DbSession, user: AdminUser,
) -> dict:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    result = await copy_knowledge(db, event, source_event_id, user.id)
    await db.commit()
    return result


@router.patch("/{doc_id}", response_model=KnowledgeDocumentOut)
async def update_knowledge(
    event_id: int,
    doc_id: int,
    payload: KnowledgeDocumentUpdate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> KnowledgeDocument:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    doc = await master_data.get_or_404(db, KnowledgeDocument, doc_id, event_id=event_id)
    before = KnowledgeDocumentOut.model_validate(doc).model_dump(mode="json")
    data = payload.model_dump(exclude_unset=True)
    await master_data.update(db, doc, data)
    doc.updated_by = user.id
    doc.updated_at = utcnow()
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="knowledge_document",
        entity_id=doc_id, before=before,
        after=KnowledgeDocumentOut.model_validate(doc).model_dump(mode="json"),
        event_id=event_id,
    )
    job = await create_reindex_job(db, event_id, user.id)
    await db.commit()
    await start_reindex_job(queue, event_id, job.id)
    await db.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge(
    event_id: int,
    doc_id: int,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> None:
    event = await master_data.get_or_404(db, Event, event_id)
    assert_event_not_completed(event)
    doc = await master_data.get_or_404(db, KnowledgeDocument, doc_id, event_id=event_id)
    was_published = doc.is_published
    await db.delete(doc)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="knowledge_document",
        entity_id=doc_id, event_id=event_id,
    )
    job = await create_reindex_job(db, event_id, user.id) if was_published else None
    await db.commit()
    if job is not None:
        await start_reindex_job(queue, event_id, job.id)
