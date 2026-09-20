import json

from app.core.time import utcnow
from app.models.enums import EventStatus
from app.models.flight import Flight, FlightAssignment
from app.models.hotel import Hotel, Room, RoomAssignment
from app.models.registration import Registration
from app.services.rag.providers.base import LLMResponse, ToolCall
from tests.conftest import make_employee


class JourneyLLM:
    """Always fetches the caller's journey, then quotes the room number from
    the tool result — used to prove isolation without a live LLM."""

    async def generate(self, system, messages):
        return messages[-1]["content"]

    def stream(self, system, messages):
        async def _gen():
            tool_msgs = [m for m in messages if m.get("role") == "tool"]
            room = "—"
            if tool_msgs:
                data = json.loads(tool_msgs[-1]["content"])
                room = (data.get("room") or {}).get("room_number") or "—"
            yield f"Phong cua ban la {room}"

        return _gen()

    async def complete(self, system, messages, tools=None):
        if any(m.get("role") == "tool" for m in messages):
            return LLMResponse(content="", tool_calls=[])
        raw = {
            "id": "call-1",
            "type": "function",
            "function": {"name": "get_my_journey", "arguments": '{"section":"room"}'},
        }
        return LLMResponse(
            content="",
            tool_calls=[ToolCall(id="call-1", name="get_my_journey", arguments={"section": "room"}, raw=raw)],
        )


def _parse_sse(resp) -> list[dict]:
    events = []
    for block in resp.text.split("\n\n"):
        line = block.strip()
        if line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


async def test_employee_cannot_open_session_for_unrelated_event(client, world, auth_headers, db_session):
    from app.models.event import Event

    other = Event(code="OTHER", name="Other", status=EventStatus.allocation_processing)
    db_session.add(other)
    await db_session.commit()
    resp = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(world.employee_user),
        json={"event_id": other.id},
    )
    assert resp.status_code == 403


async def test_chat_isolation_two_employees(client, world, auth_headers, db_session, monkeypatch):
    other = await make_employee(db_session, team=world.team, site=world.site, code="NV009")
    hotel = Hotel(event_id=world.event.id, name="KS")
    db_session.add(hotel)
    await db_session.flush()
    room_a = Room(hotel_id=hotel.id, room_number="101", capacity=2)
    room_b = Room(hotel_id=hotel.id, room_number="202", capacity=2)
    db_session.add_all([room_a, room_b])
    await db_session.flush()
    db_session.add_all([
        RoomAssignment(event_id=world.event.id, employee_id=world.employee.id, room_id=room_a.id),
        RoomAssignment(event_id=world.event.id, employee_id=other.employee.id, room_id=room_b.id),
        Registration(
            event_id=world.event.id, employee_id=other.employee.id, status="submitted",
            is_participating=True, submitted_at=utcnow(),
        ),
    ])
    world.event.status = EventStatus.information_published
    await db_session.commit()

    monkeypatch.setattr("app.services.rag.chat_service.get_llm_provider", lambda: JourneyLLM())

    async def ask(user):
        s = await client.post(
            "/api/chat/sessions", headers=auth_headers(user), json={"event_id": world.event.id}
        )
        assert s.status_code == 201
        sid = s.json()["id"]
        resp = await client.post(
            f"/api/chat/sessions/{sid}/messages",
            headers=auth_headers(user),
            json={"content": "toi o phong nao?"},
        )
        assert resp.status_code == 200
        events = _parse_sse(resp)
        text = "".join(e.get("delta", "") for e in events)
        return text

    a = await ask(world.employee_user)
    b = await ask(other.user)
    assert "101" in a
    assert "202" in b
    assert "202" not in a
    assert "101" not in b


async def test_unpublished_journey_does_not_invent_a_room(
    client, world, auth_headers, monkeypatch
):
    class UnpublishedLLM(JourneyLLM):
        def stream(self, system, messages):
            async def _gen():
                tool_msgs = [m for m in messages if m.get("role") == "tool"]
                data = json.loads(tool_msgs[-1]["content"]) if tool_msgs else {}
                yield "published=" + str(data.get("published"))

            return _gen()

    monkeypatch.setattr("app.services.rag.chat_service.get_llm_provider", lambda: UnpublishedLLM())
    s = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(world.employee_user),
        json={"event_id": world.event.id},
    )
    sid = s.json()["id"]
    resp = await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "xe toi may gio?"},
    )
    events = _parse_sse(resp)
    text = "".join(e.get("delta", "") for e in events)
    assert "published=False" in text


async def test_personal_flight_question_reads_published_journey_without_llm(
    client, world, auth_headers, db_session, monkeypatch
):
    """A factual personal-flight question must not fall back to public FAQ."""
    flight = Flight(
        event_id=world.event.id,
        flight_code="VN001",
        direction="outbound",
        capacity=10,
        origin="Hà Nội",
        destination="Đà Nẵng",
    )
    db_session.add(flight)
    await db_session.flush()
    db_session.add(
        FlightAssignment(
            event_id=world.event.id,
            employee_id=world.employee.id,
            flight_id=flight.id,
            direction="outbound",
        )
    )
    world.event.status = EventStatus.information_published
    await db_session.commit()

    class MustNotCallLLM:
        async def complete(self, *_a, **_k):
            raise AssertionError("personal journey is served directly")

    monkeypatch.setattr("app.services.rag.chat_service.get_llm_provider", lambda: MustNotCallLLM())
    session = await client.post(
        "/api/chat/sessions", headers=auth_headers(world.employee_user), json={"event_id": world.event.id}
    )
    response = await client.post(
        f"/api/chat/sessions/{session.json()['id']}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "Tôi bay ở chuyến bay nào chiều đi?"},
    )

    events = _parse_sse(response)
    text = "".join(event.get("delta", "") for event in events)
    assert "VN001" in text
    assert "VN101" not in text
    assert any(event.get("tool") == "get_my_journey" for event in events)


async def test_standalone_question_searches_when_llm_skips_tools(
    client, world, auth_headers, monkeypatch
):
    class SkipTools:
        async def generate(self, system, messages):
            return messages[-1]["content"]

        def stream(self, system, messages):
            async def _gen():
                blob = json.dumps(messages, ensure_ascii=False)
                yield "smart casual" if "smart casual" in blob.lower() else "khong co tai lieu"

            return _gen()

        async def complete(self, system, messages, tools=None):
            return LLMResponse(content="Veston va ao dai", tool_calls=[])

    async def fake_hybrid(*_a, **_k):
        return [{
            "id": 1, "title": "Dress code Gala", "source_type": "faq", "source_id": "1",
            "content": "Gala Dinner mac smart casual, khong do the thao.", "score": 0.9,
            "chunk_index": 0, "event_id": world.event.id, "document_id": 1,
        }]

    monkeypatch.setattr("app.services.rag.chat_service.get_llm_provider", lambda: SkipTools())
    monkeypatch.setattr("app.services.rag.tools.hybrid_search", fake_hybrid)

    s = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(world.employee_user),
        json={"event_id": world.event.id},
    )
    sid = s.json()["id"]
    resp = await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "Gala mac the nao?"},
    )
    events = _parse_sse(resp)
    text = "".join(e.get("delta", "") for e in events)
    assert "smart casual" in text.lower()
    assert "Veston" not in text


async def test_unrelated_followup_search_does_not_drag_in_the_prior_question(
    client, world, auth_headers, monkeypatch
):
    """Regression: found live in browser testing. Two ordinary questions in a
    row that both fall through to knowledge search (neither needs a tool)
    must be searched independently — folding the previous question into the
    new one's search query (meant only for a bare continuation like "còn
    chiều về?") polluted retrieval with the old topic's terms."""
    class SkipTools:
        async def complete(self, system, messages, tools=None):
            return LLMResponse(content="", tool_calls=[])

        def stream(self, system, messages):
            async def _gen():
                yield "ok"

            return _gen()

    seen_queries: list[str] = []

    async def fake_hybrid(_db, query, event_id, **_k):
        seen_queries.append(query)
        return []

    monkeypatch.setattr("app.services.rag.chat_service.get_llm_provider", lambda: SkipTools())
    monkeypatch.setattr("app.services.rag.tools.hybrid_search", fake_hybrid)

    s = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(world.employee_user),
        json={"event_id": world.event.id},
    )
    sid = s.json()["id"]
    await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "Gala mac gi?"},
    )
    await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "thoi tiet Da Nang ngay mai the nao?"},
    )
    assert len(seen_queries) == 2
    assert "gala" not in seen_queries[1].lower()


async def test_bare_followup_still_folds_prior_question_into_search(
    client, world, auth_headers, monkeypatch
):
    class SkipTools:
        async def complete(self, system, messages, tools=None):
            return LLMResponse(content="", tool_calls=[])

        def stream(self, system, messages):
            async def _gen():
                yield "ok"

            return _gen()

    seen_queries: list[str] = []

    async def fake_hybrid(_db, query, event_id, **_k):
        seen_queries.append(query)
        return []

    monkeypatch.setattr("app.services.rag.chat_service.get_llm_provider", lambda: SkipTools())
    monkeypatch.setattr("app.services.rag.tools.hybrid_search", fake_hybrid)

    s = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(world.employee_user),
        json={"event_id": world.event.id},
    )
    sid = s.json()["id"]
    await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "Gala mac gi?"},
    )
    await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "con trang phuc thi sao?"},
    )
    assert "gala" in seen_queries[1].lower()


async def test_llm_failure_does_not_leak_exception_text(client, world, auth_headers, monkeypatch):
    class Boom:
        async def complete(self, *a, **k):
            raise RuntimeError("dashscope api_key=sk-super-secret invalid")

    monkeypatch.setattr("app.services.rag.chat_service.get_llm_provider", lambda: Boom())
    s = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(world.employee_user),
        json={"event_id": world.event.id},
    )
    sid = s.json()["id"]
    resp = await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "xe toi may gio?"},
    )
    events = _parse_sse(resp)
    errors = [e["error"] for e in events if e.get("error")]
    assert errors
    assert "sk-super-secret" not in errors[0]
    assert "dashscope" not in errors[0].lower()


async def test_message_over_length_limit_is_rejected(client, world, auth_headers):
    s = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(world.employee_user),
        json={"event_id": world.event.id},
    )
    sid = s.json()["id"]
    resp = await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "a" * 2001},
    )
    assert resp.status_code == 422


async def test_chitchat_does_not_call_llm(client, world, auth_headers, monkeypatch):
    called = {"n": 0}

    class Boom:
        async def generate(self, *a, **k):
            called["n"] += 1
            raise AssertionError("should not generate")

        def stream(self, *a, **k):
            raise AssertionError("should not stream")

        async def complete(self, *a, **k):
            called["n"] += 1
            raise AssertionError("should not complete")

    monkeypatch.setattr("app.services.rag.chat_service.get_llm_provider", lambda: Boom())
    s = await client.post(
        "/api/chat/sessions",
        headers=auth_headers(world.employee_user),
        json={"event_id": world.event.id},
    )
    sid = s.json()["id"]
    resp = await client.post(
        f"/api/chat/sessions/{sid}/messages",
        headers=auth_headers(world.employee_user),
        json={"content": "xin chao"},
    )
    events = _parse_sse(resp)
    text = "".join(e.get("delta", "") for e in events)
    assert "Xin chào" in text
    assert called["n"] == 0
