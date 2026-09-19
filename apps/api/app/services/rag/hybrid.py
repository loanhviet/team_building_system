"""Hybrid retrieval: SQLite FTS5 (keyword / codes) + Qdrant dense (paraphrase).

Mirrors RAGFlow's text+vector mix without bringing Elasticsearch. A miss on
either side is fine — Qdrant down still answers 'VN001' via FTS; FTS miss
still answers 'quy định hủy' via vectors.

Relevance gate: a hit must actually match something (nonzero FTS rank score,
or a vector hit at/above VECTOR_MIN) *before* SOURCE_BOOST is added. The boost
only re-ranks among relevant hits — it must never be what makes an unrelated
chunk clear the bar, or every query returns 6 chunks of noise and
`empty_response_for(..., "no_knowledge")` never fires.
"""

from __future__ import annotations

import logging
import re
import unicodedata

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rag import KnowledgeDocument, RagChunk, RagDocument
from app.models.schedule import Announcement, ScheduleItem
from app.services.event_service import get_setting
from app.services.rag.ingest import (
    _checksum,
    announcement_document_content,
    faq_document_content,
    schedule_document_content,
)
from app.services.rag.providers import get_embedding_provider
from app.services.rag.qdrant_store import COLLECTION, get_client, search_chunks

logger = logging.getLogger("app")

TEXT_WEIGHT = 0.4
VECTOR_WEIGHT = 0.6
# Below this cosine score a vector hit is treated as noise, not a match —
# calibrated against the seed knowledge pack (in-scope questions score
# well above this; out-of-scope ones like "thời tiết" fall below it).
VECTOR_MIN = 0.45
TOP_CANDIDATES = 20
TOP_N = 6
# Policy/how-to docs beat schedule titles that merely share a word like "Gala".
SOURCE_BOOST = {
    "faq": 0.35,
    "terms": 0.30,
    "announcement": 0.05,
}

# Vietnamese function words that add no retrieval signal ("của tôi", "thế
# nào", "có ... không") — left in the query they'd OR-match nearly every
# chunk in FTS and mask the real gate above.
_STOPWORDS = {
    "toi", "cua", "la", "va", "the", "nao", "co", "khong", "duoc", "gi",
    "nhu", "khi", "de", "voi", "cho", "nhung", "hay", "hoac", "a", "ban",
    "minh", "tai", "sao", "sao vay", "vay", "roi", "da", "se", "bi", "o",
    "trong", "ngoai", "tren", "duoi", "nay", "do", "day", "kia", "ay",
}


def _fold(text_: str) -> str:
    nfkd = unicodedata.normalize("NFKD", unicodedata.normalize("NFC", text_))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _fts_match_query(query: str) -> str | None:
    tokens = re.findall(r"[0-9A-Za-zÀ-ỹ_]+", query, flags=re.UNICODE)
    tokens = [t for t in tokens if _fold(t) not in _STOPWORDS]
    if not tokens:
        return None
    # Quote each token so user punctuation cannot break MATCH syntax.
    return " OR ".join(f'"{t}"' for t in tokens[:12])


async def _fts_search(
    db: AsyncSession,
    query: str,
    event_id: int,
    limit: int,
    source_types: list[str] | None,
) -> list[dict]:
    match = _fts_match_query(query)
    if not match:
        return []
    sql = (
        "SELECT c.id, c.document_id, c.event_id, c.source_type, c.source_id, "
        "c.title, c.content, c.chunk_index, rag_chunks_fts.rank AS rank "
        "FROM rag_chunks_fts "
        "JOIN rag_chunks AS c ON c.id = rag_chunks_fts.rowid "
        "WHERE rag_chunks_fts MATCH :match AND c.event_id = :event_id"
    )
    params: dict = {"match": match, "event_id": event_id}
    if source_types:
        placeholders = ", ".join(f":st{i}" for i in range(len(source_types)))
        sql += f" AND c.source_type IN ({placeholders})"
        for i, st in enumerate(source_types):
            params[f"st{i}"] = st
    sql += " ORDER BY rank LIMIT :limit"
    params["limit"] = limit
    try:
        result = await db.execute(text(sql), params)
    except Exception:
        logger.warning("FTS search failed", exc_info=True)
        return []
    hits = []
    for i, row in enumerate(result.mappings().all()):
        hits.append({
            "id": row["id"],
            "document_id": row["document_id"],
            "event_id": row["event_id"],
            "source_type": row["source_type"],
            "source_id": row["source_id"],
            "title": row["title"],
            "content": row["content"],
            "chunk_index": row["chunk_index"],
            "text_rank": i,
            "score": 1.0 / (1.0 + i),
        })
    return hits


async def _vector_search(
    query: str, event_id: int, limit: int, source_types: list[str] | None
) -> list[dict]:
    try:
        # Do not initialize/download the local embedding model when Qdrant is
        # absent. FTS remains useful on a default stack without the rag profile.
        if not await get_client().collection_exists(COLLECTION):
            return []
        embedder = get_embedding_provider()
        [vector] = await embedder.embed([query])
        raw = await search_chunks(vector, event_id, limit=limit, source_types=source_types)
    except Exception:  # noqa: BLE001 - optional vector backend must not break FTS
        logger.warning("vector search unavailable, using FTS only")
        return []
    hits = []
    for item in raw:
        hits.append({
            "id": item["id"],
            "document_id": item.get("document_id"),
            "event_id": item.get("event_id", event_id),
            "source_type": item.get("source_type"),
            "source_id": item.get("source_id"),
            "title": item.get("title"),
            "content": item.get("content"),
            "chunk_index": item.get("chunk_index", 0),
            "score": float(item.get("score") or 0),
        })
    return hits


def _fuse(fts_hits: list[dict], vec_hits: list[dict]) -> list[dict]:
    merged: dict[int, dict] = {}
    for hit in fts_hits:
        merged[hit["id"]] = {**hit, "text_score": hit["score"], "vec_score": 0.0}
    for hit in vec_hits:
        existing = merged.get(hit["id"])
        if existing is None:
            merged[hit["id"]] = {**hit, "text_score": 0.0, "vec_score": hit["score"]}
        else:
            existing["vec_score"] = hit["score"]
            if not existing.get("content"):
                existing["content"] = hit.get("content")
    fused = []
    for item in merged.values():
        # Gate on an actual match *before* the source boost — otherwise a
        # boost alone (e.g. every faq chunk +0.35) would clear any threshold
        # regardless of relevance.
        if item["text_score"] <= 0 and item["vec_score"] < VECTOR_MIN:
            continue
        item["score"] = TEXT_WEIGHT * item["text_score"] + VECTOR_WEIGHT * item["vec_score"]
        item["score"] += SOURCE_BOOST.get(item.get("source_type") or "", 0.0)
        fused.append(item)
    fused.sort(key=lambda h: h["score"], reverse=True)
    return fused


async def _current_public_hits(db: AsyncSession, hits: list[dict], event_id: int) -> list[dict]:
    """Never trust a search index as the publish/validity authority.

    An unpublish or edit commits before the worker removes old FTS/Qdrant
    entries. Qdrant can also retain a deleted point if its delete failed.
    Verify each candidate against live SQL and return current chunk content.
    """
    ids = [hit["id"] for hit in hits]
    if not ids:
        return []
    rows = await db.execute(
        select(RagChunk, RagDocument)
        .join(RagDocument, RagDocument.id == RagChunk.document_id)
        .where(
            RagChunk.id.in_(ids), RagChunk.event_id == event_id,
            RagDocument.event_id == event_id, RagDocument.scope == "public",
        )
    )
    current = {chunk.id: (chunk, doc) for chunk, doc in rows.all()}

    source_ids: dict[str, set[int]] = {"faq": set(), "schedule_item": set(), "announcement": set()}
    for _chunk, doc in current.values():
        if doc.source_type in source_ids and doc.source_id.isdigit():
            source_ids[doc.source_type].add(int(doc.source_id))

    sources: dict[str, dict[int, object]] = {}
    for source_type, model in (
        ("faq", KnowledgeDocument),
        ("schedule_item", ScheduleItem),
        ("announcement", Announcement),
    ):
        values = source_ids[source_type]
        if values:
            result = await db.execute(
                select(model).where(model.id.in_(values), model.event_id == event_id)
            )
            sources[source_type] = {item.id: item for item in result.scalars().all()}
        else:
            sources[source_type] = {}

    terms = await get_setting(db, event_id, "terms_text", "")
    approved: list[dict] = []
    for hit in hits:
        pair = current.get(hit["id"])
        if pair is None:
            continue
        chunk, doc = pair
        fresh_content = None
        if doc.source_type == "faq" and doc.source_id.isdigit():
            faq = sources["faq"].get(int(doc.source_id))
            if faq is not None and faq.is_published:
                fresh_content = faq_document_content(faq)
        elif doc.source_type == "schedule_item" and doc.source_id.isdigit():
            item = sources["schedule_item"].get(int(doc.source_id))
            if item is not None and item.is_published and item.audience == "all":
                fresh_content = schedule_document_content(item)
        elif doc.source_type == "announcement" and doc.source_id.isdigit():
            item = sources["announcement"].get(int(doc.source_id))
            if item is not None and item.published_at is not None:
                fresh_content = announcement_document_content(item)
        elif doc.source_type == "terms" and terms:
            fresh_content = str(terms)
        if fresh_content is None or _checksum(fresh_content) != doc.checksum:
            continue
        approved.append({
            **hit, "document_id": doc.id, "event_id": event_id,
            "source_type": doc.source_type, "source_id": doc.source_id,
            "title": chunk.title, "content": chunk.content,
        })
    return approved


async def hybrid_search(
    db: AsyncSession,
    query: str,
    event_id: int,
    source_types: list[str] | None = None,
    top_n: int = TOP_N,
) -> list[dict]:
    if not (query or "").strip():
        return []
    fts_hits = await _fts_search(db, query, event_id, TOP_CANDIDATES, source_types)
    vec_hits = await _vector_search(query, event_id, TOP_CANDIDATES, source_types)
    fused = _fuse(fts_hits, vec_hits)
    return (await _current_public_hits(db, fused[:TOP_CANDIDATES], event_id))[:top_n]
