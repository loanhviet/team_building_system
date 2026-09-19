import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.rag import RagChunk, RagDocument
from app.services.rag.chunking import chunk_text
from app.services.rag.fts import delete_chunk_fts, delete_orphan_fts, ensure_fts, upsert_chunk_fts
from app.services.rag.ingest import build_event_documents
from app.services.rag.providers import get_embedding_provider
from app.services.rag.qdrant_store import delete_documents, ensure_collection, upsert_points

logger = logging.getLogger("app")


async def _replace_chunks(db: AsyncSession, doc: RagDocument) -> tuple[list[RagChunk], list[int]]:
    """Rebuild chunks for one changed document. Returns (new_chunks, old_chunk_ids
    to delete from Qdrant) — the Qdrant delete itself happens later, outside
    this DB transaction."""
    result = await db.execute(select(RagChunk).where(RagChunk.document_id == doc.id))
    old = list(result.scalars().all())
    old_ids = [c.id for c in old]
    await delete_chunk_fts(db, old_ids)
    for chunk in old:
        await db.delete(chunk)
    await db.flush()

    pieces = chunk_text(doc.content)
    created: list[RagChunk] = []
    for i, piece in enumerate(pieces):
        chunk = RagChunk(
            document_id=doc.id,
            event_id=doc.event_id,
            source_type=doc.source_type,
            source_id=doc.source_id,
            title=doc.title,
            content=piece,
            chunk_index=i,
        )
        db.add(chunk)
        created.append(chunk)
    await db.flush()
    doc.chunk_count = len(created)
    for chunk in created:
        await upsert_chunk_fts(
            db,
            chunk_id=chunk.id,
            title=chunk.title,
            content=chunk.content,
            event_id=chunk.event_id,
            source_type=chunk.source_type,
        )
    return created, old_ids


async def reindex_event(db: AsyncSession, event_id: int) -> dict:
    """Two phases so a slow/flaky Qdrant never holds the SQLite write lock:

    1. DB only — build/replace docs+chunks+FTS, commit. Fast, always safe.
    2. Qdrant — embed and upsert chunks belonging to documents whose
       `indexed_at` is still NULL (new/changed, or left over from a Qdrant
       failure on a previous run), then commit indexed_at in one short write.
       If Qdrant/embedding fails, indexed_at simply stays NULL and the next
       reindex retries it — no manual "force re-embed" needed.
    """
    await ensure_fts(db)
    await delete_orphan_fts(db)

    docs = await build_event_documents(db, event_id)
    keep_ids = {doc.id for doc, _ in docs}

    stale_stmt = select(RagDocument).where(RagDocument.event_id == event_id)
    if keep_ids:
        stale_stmt = stale_stmt.where(RagDocument.id.notin_(keep_ids))
    stale = await db.execute(stale_stmt)
    removed = 0
    stale_chunk_ids: list[int] = []
    for doc in list(stale.scalars().all()):
        result = await db.execute(select(RagChunk).where(RagChunk.document_id == doc.id))
        old_chunks = list(result.scalars().all())
        stale_chunk_ids.extend(c.id for c in old_chunks)
        await delete_chunk_fts(db, [c.id for c in old_chunks])
        for chunk in old_chunks:
            await db.delete(chunk)
        await db.delete(doc)
        removed += 1

    changed = [doc for doc, is_changed in docs if is_changed]
    changed_chunk_ids: list[int] = []
    for doc in changed:
        _new_chunks, old_ids = await _replace_chunks(db, doc)
        changed_chunk_ids.extend(old_ids)

    await db.commit()

    # --- Phase 2: Qdrant, outside the DB transaction above ---
    stale_qdrant_ids = stale_chunk_ids + changed_chunk_ids
    try:
        if stale_qdrant_ids:
            await delete_documents(stale_qdrant_ids)
    except Exception:  # noqa: BLE001 - optional vector backend must not break FTS
        logger.warning("qdrant delete unavailable for chunks %s", stale_qdrant_ids)

    embedder = get_embedding_provider()
    try:
        await ensure_collection(embedder.dimension)
        qdrant_ok = True
    except Exception:  # noqa: BLE001 - optional vector backend must not break FTS
        logger.warning("qdrant unavailable, indexing FTS only")
        qdrant_ok = False

    embedded = 0
    if qdrant_ok:
        pending = await db.execute(
            select(RagChunk)
            .join(RagDocument, RagDocument.id == RagChunk.document_id)
            .where(RagDocument.event_id == event_id, RagDocument.indexed_at.is_(None))
        )
        pending_chunks = list(pending.scalars().all())
        if pending_chunks:
            try:
                vectors = await embedder.embed([c.content for c in pending_chunks])
                points = [
                    (
                        chunk.id,
                        vector,
                        {
                            "event_id": chunk.event_id,
                            "scope": "public",
                            "source_type": chunk.source_type,
                            "source_id": chunk.source_id,
                            "document_id": chunk.document_id,
                            "title": chunk.title,
                            "content": chunk.content,
                            "chunk_index": chunk.chunk_index,
                        },
                    )
                    for chunk, vector in zip(pending_chunks, vectors, strict=True)
                ]
                await upsert_points(points)
                embedded = len(points)
                pending_doc_ids = {c.document_id for c in pending_chunks}
                docs_result = await db.execute(
                    select(RagDocument).where(RagDocument.id.in_(pending_doc_ids))
                )
                for pending_doc in docs_result.scalars().all():
                    pending_doc.indexed_at = utcnow()
                await db.commit()
            except Exception:
                logger.warning("embedding/qdrant upsert failed, will retry next reindex", exc_info=True)

    return {
        "total_documents": len(docs),
        "reembedded": embedded,
        "changed_documents": len(changed),
        "removed_documents": removed,
        "qdrant": qdrant_ok,
    }
