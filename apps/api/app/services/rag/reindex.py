from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.services.rag.ingest import build_event_documents
from app.services.rag.providers import get_embedding_provider
from app.services.rag.qdrant_store import ensure_collection, upsert_document


async def reindex_event(db: AsyncSession, event_id: int) -> dict:
    embedder = get_embedding_provider()
    await ensure_collection(embedder.dimension)

    docs = await build_event_documents(db, event_id)
    changed = [doc for doc, is_changed in docs if is_changed]

    if changed:
        vectors = await embedder.embed([doc.content for doc in changed])
        for doc, vector in zip(changed, vectors, strict=True):
            await upsert_document(
                doc.id, vector,
                {
                    "event_id": doc.event_id, "scope": doc.scope, "scope_ref_id": doc.scope_ref_id,
                    "source_type": doc.source_type, "title": doc.title, "content": doc.content,
                },
            )
            doc.indexed_at = utcnow()

    await db.commit()
    return {"total_documents": len(docs), "reembedded": len(changed)}
