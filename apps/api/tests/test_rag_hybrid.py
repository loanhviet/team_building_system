from app.models.rag import KnowledgeDocument, RagChunk, RagDocument
from app.models.schedule import ScheduleItem
from app.services.rag.fts import delete_orphan_fts, upsert_chunk_fts
from app.services.rag.hybrid import _vector_search, hybrid_search
from app.services.rag.ingest import _checksum, faq_document_content, schedule_document_content


async def _seed_chunk(db_session, world, *, source_type, source_id, title, content):
    if source_type == "faq":
        source = KnowledgeDocument(
            event_id=world.event.id, title=title, body_md=content, is_published=True,
        )
    else:
        source = ScheduleItem(
            event_id=world.event.id, title=title, description=content, is_published=True,
        )
    db_session.add(source)
    await db_session.flush()
    source_id = str(source.id)
    indexed_content = (
        faq_document_content(source) if source_type == "faq"
        else schedule_document_content(source)
    )
    doc = RagDocument(
        event_id=world.event.id, source_type=source_type, source_id=source_id,
        title=title, content=indexed_content, checksum=_checksum(indexed_content), scope="public",
    )
    db_session.add(doc)
    await db_session.flush()
    chunk = RagChunk(
        document_id=doc.id, event_id=world.event.id, source_type=source_type,
        source_id=source_id, title=title, content=indexed_content, chunk_index=0,
    )
    db_session.add(chunk)
    await db_session.flush()
    await upsert_chunk_fts(
        db_session, chunk_id=chunk.id, title=title, content=indexed_content,
        event_id=world.event.id, source_type=source_type,
    )
    return chunk, source


async def test_fts_hits_flight_code(db_session, world, monkeypatch):
    async def no_vec(*_a, **_k):
        return []

    monkeypatch.setattr("app.services.rag.hybrid._vector_search", no_vec)

    await _seed_chunk(
        db_session, world, source_type="faq", source_id="1", title="Bay",
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

    chunk, _source = await _seed_chunk(
        db_session, world, source_type="faq", source_id="1", title="FAQ",
        content="Không có từ khoá liên quan trong câu hỏi.",
    )
    monkeypatch.setattr("app.services.rag.hybrid._vector_search", weak_vec)

    hits = await hybrid_search(db_session, "thời tiết Đà Nẵng ngày mai", world.event.id)
    assert hits == []


async def test_unpublished_faq_and_stale_vector_hit_are_rejected(db_session, world, monkeypatch):
    chunk, source = await _seed_chunk(
        db_session, world, source_type="faq", source_id="1", title="Quy định",
        content="Quy định mật khẩu nhận thẻ Gala.",
    )
    async def stale_vec(*_a, **_k):
        return [{
            "id": chunk.id, "score": 0.9, "document_id": chunk.document_id,
            "event_id": world.event.id, "source_type": "faq", "source_id": str(source.id),
            "title": chunk.title, "content": chunk.content, "chunk_index": 0,
        }]
    monkeypatch.setattr("app.services.rag.hybrid._vector_search", stale_vec)
    source.is_published = False
    await db_session.flush()
    assert await hybrid_search(db_session, "Gala", world.event.id) == []


async def test_edited_faq_is_rejected_until_reindexed(db_session, world, monkeypatch):
    async def no_vec(*_a, **_k):
        return []
    monkeypatch.setattr("app.services.rag.hybrid._vector_search", no_vec)
    _chunk, source = await _seed_chunk(
        db_session, world, source_type="faq", source_id="1", title="Quy định",
        content="Nội dung cũ về Gala.",
    )
    source.body_md = "Nội dung mới về Gala."
    await db_session.flush()
    assert await hybrid_search(db_session, "Gala", world.event.id) == []


async def test_team_only_schedule_is_not_public_chat_knowledge(db_session, world, monkeypatch):
    async def no_vec(*_a, **_k):
        return []
    monkeypatch.setattr("app.services.rag.hybrid._vector_search", no_vec)
    _chunk, source = await _seed_chunk(
        db_session, world, source_type="schedule_item", source_id="1",
        title="Lịch riêng Team", content="Tập trung Team ở phòng họp số 3.",
    )
    source.audience = "team"
    source.audience_ref_id = world.team.id
    await db_session.flush()
    assert await hybrid_search(db_session, "Team phòng họp", world.event.id) == []


async def test_missing_qdrant_does_not_initialize_embedding_model(monkeypatch):
    class MissingCollection:
        async def collection_exists(self, _name):
            return False

    monkeypatch.setattr("app.services.rag.hybrid.get_client", lambda: MissingCollection())

    def should_not_load():
        raise AssertionError("embedding model should not be loaded")

    monkeypatch.setattr("app.services.rag.hybrid.get_embedding_provider", should_not_load)
    assert await _vector_search("Gala", 1, 5, None) == []


async def test_reindex_cleanup_removes_orphan_fts_rows(db_session):
    from sqlalchemy import text

    await db_session.execute(text(
        "INSERT INTO rag_chunks_fts(rowid, title, content, event_id, source_type) "
        "VALUES (99999, 'Old', 'Old content', 1, 'faq')"
    ))
    await delete_orphan_fts(db_session)
    assert await db_session.scalar(text("SELECT COUNT(*) FROM rag_chunks_fts")) == 0
