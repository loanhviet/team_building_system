from app.models.rag import RagChunk, RagDocument
from app.services.rag.fts import upsert_chunk_fts
from app.services.rag.hybrid import hybrid_search


async def _seed_chunk(db_session, world, *, source_type, source_id, title, content):
    doc = RagDocument(
        event_id=world.event.id, source_type=source_type, source_id=source_id,
        title=title, content=content, checksum=f"c{source_id}", scope="public",
    )
    db_session.add(doc)
    await db_session.flush()
    chunk = RagChunk(
        document_id=doc.id, event_id=world.event.id, source_type=source_type,
        source_id=source_id, title=title, content=content, chunk_index=0,
    )
    db_session.add(chunk)
    await db_session.flush()
    await upsert_chunk_fts(
        db_session, chunk_id=chunk.id, title=title, content=content,
        event_id=world.event.id, source_type=source_type,
    )
    return chunk


async def test_fts_hits_flight_code(db_session, world, monkeypatch):
    async def no_vec(*_a, **_k):
        return []

    monkeypatch.setattr("app.services.rag.hybrid._vector_search", no_vec)

    await _seed_chunk(
        db_session, world, source_type="event", source_id="1", title="Bay",
        content="Chuyến bay VN001 khởi hành 08:15",
    )

    hits = await hybrid_search(db_session, "VN001", world.event.id)
    assert hits
    assert any("VN001" in h["content"] for h in hits)


async def test_faq_outranks_schedule_when_both_mention_gala(db_session, world, monkeypatch):
    async def no_vec(*_a, **_k):
        return []

    monkeypatch.setattr("app.services.rag.hybrid._vector_search", no_vec)

    await _seed_chunk(
        db_session, world, source_type="schedule_item", source_id="1",
        title="Gala Dinner", content="Gala Dinner tại sảnh tiệc 18:30.",
    )
    await _seed_chunk(
        db_session, world, source_type="faq", source_id="2", title="Trang phục Gala",
        content="Dress code Gala Dinner: smart casual. Không veston bắt buộc.",
    )

    hits = await hybrid_search(db_session, "Gala mac the nao", world.event.id)
    assert hits
    assert hits[0]["source_type"] == "faq"


async def test_query_of_only_stopwords_returns_nothing(db_session, world, monkeypatch):
    """'của tôi thế nào' carries no retrieval signal — with a boost-blind gate
    it would otherwise OR-match every chunk in FTS and never return empty."""
    async def no_vec(*_a, **_k):
        return []

    monkeypatch.setattr("app.services.rag.hybrid._vector_search", no_vec)
    await _seed_chunk(
        db_session, world, source_type="faq", source_id="1", title="FAQ",
        content="Nội dung không liên quan.",
    )

    hits = await hybrid_search(db_session, "của tôi thế nào", world.event.id)
    assert hits == []


async def test_low_vector_score_is_dropped_even_with_source_boost(db_session, world, monkeypatch):
    """A weak vector hit on an unrelated faq chunk must not clear the gate
    just because SOURCE_BOOST['faq'] would push its post-boost score up —
    the boost only re-ranks hits that already matched."""
    async def weak_vec(*_a, **_k):
        return [{
            "id": chunk.id, "score": 0.2, "document_id": chunk.document_id,
            "event_id": chunk.event_id, "source_type": chunk.source_type,
            "source_id": chunk.source_id, "title": chunk.title,
            "content": chunk.content, "chunk_index": 0,
        }]

    chunk = await _seed_chunk(
        db_session, world, source_type="faq", source_id="1", title="FAQ",
        content="Không có từ khoá liên quan trong câu hỏi.",
    )
    monkeypatch.setattr("app.services.rag.hybrid._vector_search", weak_vec)

    hits = await hybrid_search(db_session, "thời tiết Đà Nẵng ngày mai", world.event.id)
    assert hits == []
