import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.rag import RagChunk, RagDocument
from app.services.rag.chunking import chunk_text
from app.services.rag.fts import delete_chunk_fts, ensure_fts, upsert_chunk_fts
from app.services.rag.ingest import build_event_documents
from app.services.rag.providers import get_embedding_provider
from app.services.rag.qdrant_store import delete_documents, ensure_collection, upsert_document

logger = logging.getLogger("app")


async def _replace_chunks(db: AsyncSession, doc: RagDocument) -> list[RagChunk]:
    result = await db.execute(select(RagChunk).where(RagChunk.document_id == doc.id))
    old = list(result.scalars().all())
    old_ids = [c.id for c in old]
    await delete_chunk_fts(db, old_ids)
    try:
        await delete_documents(old_ids)
    except Exception:
        logger.warning("qdrant delete failed for chunks %s", old_ids, exc_info=True)
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
    return created


async def reindex_event(db: AsyncSession, event_id: int) -> dict:
    await ensure_fts(db)
    embedder = get_embedding_provider()
    try:
        await ensure_collection(embedder.dimension)
        qdrant_ok = True
    except Exception:
        logger.warning("qdrant unavailable, indexing FTS only", exc_info=True)
        qdrant_ok = False

    docs = await build_event_documents(db, event_id)
    keep_ids = {doc.id for doc, _ in docs}

    stale_stmt = select(RagDocument).where(RagDocument.event_id == event_id)
    if keep_ids:
        stale_stmt = stale_stmt.where(RagDocument.id.notin_(keep_ids))
    stale = await db.execute(stale_stmt)
    removed = 0
    for doc in list(stale.scalars().all()):
        # Drop leftover Phase-8 personal-journey docs and unpublished sources.
        result = await db.execute(select(RagChunk).where(RagChunk.document_id == doc.id))
        old_chunks = list(result.scalars().all())
        chunk_ids = [c.id for c in old_chunks]
        await delete_chunk_fts(db, chunk_ids)
        try:
            await delete_documents(chunk_ids)
        except Exception:
            logger.warning("qdrant delete failed for chunks %s", chunk_ids, exc_info=True)
        for chunk in old_chunks:
            await db.delete(chunk)
        await db.delete(doc)
        removed += 1

    changed = [doc for doc, is_changed in docs if is_changed]
    new_chunks: list[RagChunk] = []
    for doc in changed:
        new_chunks.extend(await _replace_chunks(db, doc))

    embedded = 0
    if qdrant_ok and new_chunks:
        vectors = await embedder.embed([c.content for c in new_chunks])
        for chunk, vector in zip(new_chunks, vectors, strict=True):
            await upsert_document(
                chunk.id, vector,
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
            embedded += 1

    for doc in changed:
        doc.indexed_at = utcnow()

    await db.commit()
    return {
        "total_documents": len(docs),
        "reembedded": embedded,
        "changed_documents": len(changed),
        "removed_documents": removed,
        "qdrant": qdrant_ok,
    }
