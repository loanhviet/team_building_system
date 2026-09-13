"""BTC operations on the knowledge pack that aren't plain CRUD."""

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.event import Event
from app.models.rag import KnowledgeDocument
from app.services import master_data
from app.services.audit_service import record_audit


async def copy_knowledge(
    db: AsyncSession, target_event: Event, source_event_id: int, actor_id: int
) -> dict:
    """Copy every FAQ from `source_event_id` into `target_event` as drafts.

    Lets BTC reuse a prior kỳ's FAQ instead of retyping it (or seeding demo
    content) for a new event — see docs/CHAT-RAG.md. Copies land unpublished
    so nothing reaches chat until BTC reviews and publishes each one; titles
    already present at the target are skipped rather than duplicated.
    """
    if source_event_id == target_event.id:
        raise AppError(
            "validation_error", "Không thể sao chép từ chính sự kiện này",
            status.HTTP_400_BAD_REQUEST,
        )
    source_event = await db.get(Event, source_event_id)
    if source_event is None:
        raise AppError("not_found", "Sự kiện nguồn không tồn tại", status.HTTP_404_NOT_FOUND)

    existing_titles = set(
        (
            await db.execute(
                select(KnowledgeDocument.title).where(
                    KnowledgeDocument.event_id == target_event.id
                )
            )
        )
        .scalars()
        .all()
    )
    source_docs = (
        await db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.event_id == source_event_id)
        )
    ).scalars().all()

    copied = 0
    skipped = 0
    for doc in source_docs:
        if doc.title in existing_titles:
            skipped += 1
            continue
        new_doc = await master_data.create(
            db,
            KnowledgeDocument,
            {"title": doc.title, "body_md": doc.body_md, "is_published": False, "updated_by": actor_id},
            event_id=target_event.id,
        )
        await record_audit(
            db, actor_user_id=actor_id, action="create", entity_type="knowledge_document",
            entity_id=new_doc.id, after={"title": doc.title, "copied_from_event_id": source_event_id},
            event_id=target_event.id,
        )
        existing_titles.add(doc.title)
        copied += 1

    return {"copied": copied, "skipped": skipped}
