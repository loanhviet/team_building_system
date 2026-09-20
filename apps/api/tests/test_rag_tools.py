from sqlalchemy import select

from app.models.enums import EventStatus, UserRole
from app.models.hotel import Hotel, Room, RoomAssignment
from app.models.rag import KnowledgeDocument, RagChunk, RagDocument
from app.services.rag.ingest import build_event_documents
from app.services.rag.reindex import reindex_event
from app.services.rag.tools import (
    ToolContext,
    get_my_journey,
    get_my_registration,
    get_my_team_roster,
)
from tests.conftest import make_employee


async def _two_employees_with_rooms(db_session, world):
    other = await make_employee(db_session, team=world.team, site=world.site, code="NV002")
    hotel = Hotel(event_id=world.event.id, name="KS Test", address="Da Nang")
    db_session.add(hotel)
    await db_session.flush()
    room_a = Room(hotel_id=hotel.id, room_number="101", capacity=2)
    room_b = Room(hotel_id=hotel.id, room_number="202", capacity=2)
    db_session.add_all([room_a, room_b])
    await db_session.flush()
    db_session.add_all([
        RoomAssignment(event_id=world.event.id, employee_id=world.employee.id, room_id=room_a.id),
        RoomAssignment(event_id=world.event.id, employee_id=other.employee.id, room_id=room_b.id),
    ])
    world.event.status = EventStatus.information_published
    await db_session.commit()
    return other


async def test_journey_tool_is_scoped_to_the_calling_employee(db_session, world):
    other = await _two_employees_with_rooms(db_session, world)
    mine, _ = await get_my_journey(ToolContext(db_session, world.event, world.employee_user))
    theirs, _ = await get_my_journey(ToolContext(db_session, world.event, other.user))
    assert mine["published"] is True
    assert mine["room"]["room_number"] == "101"
    assert theirs["room"]["room_number"] == "202"
    assert mine["room"]["room_number"] != theirs["room"]["room_number"]


async def test_journey_tool_hides_allocation_before_publish(db_session, world):
    payload, _ = await get_my_journey(ToolContext(db_session, world.event, world.employee_user))
    assert payload["published"] is False
    assert "room" not in payload


async def test_registration_tool_returns_shift(db_session, world):
    payload, cites = await get_my_registration(
        ToolContext(db_session, world.event, world.employee_user)
    )
    assert payload["has_registration"] is True
    assert payload["shift_name"] == "Ca 1"
    assert cites[0]["href"] == "/register"


async def test_roster_tool_forbidden_for_employee(db_session, world):
    from app.services.rag.tools import execute_tool

    result, _ = await execute_tool(
        ToolContext(db_session, world.event, world.employee_user), "get_my_team_roster", {}
    )
    assert result["code"] == "forbidden"


async def test_roster_tool_works_for_leader(db_session, world):
    world.employee_user.role = UserRole.team_leader
    await db_session.commit()
    payload, _ = await get_my_team_roster(ToolContext(db_session, world.event, world.employee_user))
    assert payload["team_id"] == world.team.id
    assert any(m["employee_id"] == world.employee.id for m in payload["members"])


class FakeEmbed:
    dimension = 8

    async def embed(self, texts):
        return [[0.1] * 8 for _ in texts]


async def test_ingest_does_not_index_personal_journeys(db_session, world, monkeypatch):
    await _two_employees_with_rooms(db_session, world)

    async def noop(*_a, **_k):
        return None

    monkeypatch.setattr("app.services.rag.reindex.get_embedding_provider", lambda: FakeEmbed())
    monkeypatch.setattr("app.services.rag.reindex.ensure_collection", noop)
    monkeypatch.setattr("app.services.rag.reindex.upsert_points", noop)
    monkeypatch.setattr("app.services.rag.reindex.delete_documents", noop)
    monkeypatch.setattr("app.services.rag.reindex.event_point_count", lambda _event_id: noop())
    monkeypatch.setattr("app.services.rag.reindex.delete_event_points", noop)

    db_session.add(
        KnowledgeDocument(
            event_id=world.event.id, title="Dress code", body_md="Smart casual.",
            is_published=True,
        )
    )
    await db_session.commit()

    await reindex_event(db_session, world.event.id)
    docs = (
        await db_session.execute(select(RagDocument).where(RagDocument.event_id == world.event.id))
    ).scalars().all()
    types = {d.source_type for d in docs}
    assert "journey" not in types
    assert "faq" in types


async def test_build_documents_skips_unpublished_faq(db_session, world):
    db_session.add(
        KnowledgeDocument(
            event_id=world.event.id, title="Draft", body_md="secret",
            is_published=False,
        )
    )
    await db_session.commit()
    docs = await build_event_documents(db_session, world.event.id)
    titles = [d.title for d, _ in docs]
    assert "Draft" not in titles


async def test_reindex_retries_embedding_after_a_failed_run(db_session, world, monkeypatch):
    """A Qdrant/embedding failure must not need a manual 'force re-embed':
    the failed document's indexed_at stays NULL, so the *next* reindex picks
    it up again with no other input."""
    db_session.add(
        KnowledgeDocument(
            event_id=world.event.id, title="Dress code", body_md="Smart casual.",
            is_published=True,
        )
    )
    await db_session.commit()

    monkeypatch.setattr("app.services.rag.reindex.get_embedding_provider", lambda: FakeEmbed())

    async def boom(*_a, **_k):
        raise RuntimeError("qdrant down")

    monkeypatch.setattr("app.services.rag.reindex.ensure_collection", boom)
    summary = await reindex_event(db_session, world.event.id)
    assert summary["qdrant"] is False
    assert summary["reembedded"] == 0

    doc = (
        await db_session.execute(select(RagDocument).where(RagDocument.source_type == "faq"))
    ).scalar_one()
    assert doc.indexed_at is None
    chunk = (
        await db_session.execute(select(RagChunk).where(RagChunk.document_id == doc.id))
    ).scalar_one()
    assert chunk.content  # FTS/DB side still indexed even though Qdrant failed

    upserted: list = []

    async def noop(*_a, **_k):
        return None

    async def record_upsert(points):
        upserted.extend(points)

    monkeypatch.setattr("app.services.rag.reindex.ensure_collection", noop)
    monkeypatch.setattr("app.services.rag.reindex.upsert_points", record_upsert)
    monkeypatch.setattr("app.services.rag.reindex.delete_documents", noop)
    monkeypatch.setattr("app.services.rag.reindex.event_point_count", lambda _event_id: noop())
    monkeypatch.setattr("app.services.rag.reindex.delete_event_points", noop)

    summary = await reindex_event(db_session, world.event.id)
    assert summary["qdrant"] is True
    assert summary["reembedded"] == 1
    assert upserted[0][0] == chunk.id

    await db_session.refresh(doc)
    assert doc.indexed_at is not None


async def test_reindex_restores_an_event_after_its_qdrant_points_are_cleared(
    db_session, world, monkeypatch
):
    """The SQLite checkpoint alone cannot prove Qdrant still has its vectors."""
    db_session.add(
        KnowledgeDocument(
            event_id=world.event.id, title="Dress code", body_md="Smart casual.",
            is_published=True,
        )
    )
    await db_session.commit()

    async def noop(*_a, **_k):
        return None

    upserted: list = []
    point_counts = [1, 0]

    async def count_points(_event_id):
        return point_counts.pop(0)

    async def record_upsert(points):
        upserted.extend(points)

    monkeypatch.setattr("app.services.rag.reindex.get_embedding_provider", lambda: FakeEmbed())
    monkeypatch.setattr("app.services.rag.reindex.ensure_collection", noop)
    monkeypatch.setattr("app.services.rag.reindex.upsert_points", record_upsert)
    monkeypatch.setattr("app.services.rag.reindex.delete_documents", noop)
    monkeypatch.setattr("app.services.rag.reindex.event_point_count", count_points)
    deleted_events: list[int] = []

    async def delete_event(event_id):
        deleted_events.append(event_id)

    monkeypatch.setattr("app.services.rag.reindex.delete_event_points", delete_event)

    first = await reindex_event(db_session, world.event.id)
    assert first["reembedded"] == 1
    assert first["reconciled"] is False
    upserted.clear()

    restored = await reindex_event(db_session, world.event.id)
    assert restored["reembedded"] == 1
    assert restored["reconciled"] is True
    assert deleted_events == [world.event.id]
    assert len(upserted) == 1
