from app.models.rag import RagChunk, RagDocument
from app.services.rag.fts import upsert_chunk_fts
from app.services.rag.hybrid import hybrid_search


async def test_fts_hits_flight_code(db_session, world, monkeypatch):
    async def no_vec(*_a, **_k):
        return []

    monkeypatch.setattr("app.services.rag.hybrid._vector_search", no_vec)

    doc = RagDocument(
        event_id=world.event.id, source_type="event", source_id="1",
        title="Bay", content="Chuyến VN001", checksum="c", scope="public",
    )
    db_session.add(doc)
    await db_session.flush()
    chunk = RagChunk(
        document_id=doc.id, event_id=world.event.id, source_type="event",
        source_id="1", title="Bay", content="Chuyến bay VN001 khởi hành 08:15",
        chunk_index=0,
    )
    db_session.add(chunk)
    await db_session.flush()
    await upsert_chunk_fts(
        db_session, chunk_id=chunk.id, title=chunk.title, content=chunk.content,
        event_id=chunk.event_id, source_type=chunk.source_type,
    )

    hits = await hybrid_search(db_session, "VN001", world.event.id)
    assert hits
    assert any("VN001" in h["content"] for h in hits)


async def test_faq_outranks_schedule_when_both_mention_gala(db_session, world, monkeypatch):
    async def no_vec(*_a, **_k):
        return []

    monkeypatch.setattr("app.services.rag.hybrid._vector_search", no_vec)

    pairs = [
        ("schedule_item", "Gala Dinner", "Gala Dinner tại sảnh tiệc 18:30."),
        ("faq", "Trang phục Gala", "Dress code Gala Dinner: smart casual. Không veston bắt buộc."),
    ]
    for i, (stype, title, content) in enumerate(pairs, start=1):
        doc = RagDocument(
            event_id=world.event.id, source_type=stype, source_id=str(i),
            title=title, content=content, checksum=f"c{i}", scope="public",
        )
        db_session.add(doc)
        await db_session.flush()
        chunk = RagChunk(
            document_id=doc.id, event_id=world.event.id, source_type=stype,
            source_id=str(i), title=title, content=content, chunk_index=0,
        )
        db_session.add(chunk)
        await db_session.flush()
        await upsert_chunk_fts(
            db_session, chunk_id=chunk.id, title=title, content=content,
            event_id=world.event.id, source_type=stype,
        )

    hits = await hybrid_search(db_session, "Gala mac the nao", world.event.id)
    assert hits
    assert hits[0]["source_type"] == "faq"
