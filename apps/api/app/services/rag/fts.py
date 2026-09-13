"""SQLite FTS5 keyword index for published RAG chunks.

Kept as raw SQL because SQLAlchemy has no first-class FTS5 mapping. The
virtual table is created IF NOT EXISTS on every SQLite connect so tests and
fresh containers don't depend on remembering to run a one-off DDL.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

FTS_DDL = """
CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
    title,
    content,
    event_id UNINDEXED,
    source_type UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
)
"""


def ensure_fts_sync(cursor) -> None:
    cursor.execute(FTS_DDL)


async def ensure_fts(db: AsyncSession) -> None:
    await db.execute(text(FTS_DDL))


async def upsert_chunk_fts(
    db: AsyncSession,
    *,
    chunk_id: int,
    title: str,
    content: str,
    event_id: int,
    source_type: str,
) -> None:
    await db.execute(text("DELETE FROM rag_chunks_fts WHERE rowid = :id"), {"id": chunk_id})
    await db.execute(
        text(
            "INSERT INTO rag_chunks_fts(rowid, title, content, event_id, source_type) "
            "VALUES (:id, :title, :content, :event_id, :source_type)"
        ),
        {
            "id": chunk_id,
            "title": title,
            "content": content,
            "event_id": event_id,
            "source_type": source_type,
        },
    )


async def delete_chunk_fts(db: AsyncSession, chunk_ids: list[int]) -> None:
    if not chunk_ids:
        return
    for chunk_id in chunk_ids:
        await db.execute(text("DELETE FROM rag_chunks_fts WHERE rowid = :id"), {"id": chunk_id})


async def delete_event_fts(db: AsyncSession, event_id: int) -> None:
    await db.execute(text("DELETE FROM rag_chunks_fts WHERE event_id = :event_id"), {"event_id": event_id})
