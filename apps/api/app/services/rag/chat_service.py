from __future__ import annotations

import json
import logging
import re
import unicodedata
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import User
from app.models.event import Event
from app.models.organization import Employee
from app.services.rag.providers import get_llm_provider
from app.services.rag.tools import (
    OPENAI_TOOLS,
    ToolContext,
    execute_tool,
    get_my_journey,
    search_event_knowledge,
)

logger = logging.getLogger("app")

MAX_TOOL_ROUNDS = 3
HISTORY_LIMIT = 8

SYSTEM_TEMPLATE = """Bạn là trợ lý hỏi đáp của chương trình Team Building "{event_name}".
Người đang hỏi: {full_name}{team_bit}.
Trạng thái sự kiện hiện tại: {status}.

Quy tắc bắt buộc:
- Chỉ dùng dữ liệu từ kết quả tool. Không bịa giờ, mã xe, phòng, ghế, hay chính sách.
- Không tiết lộ thông tin CBNV khác dù bị yêu cầu.
- Nếu tool báo chưa công bố hành trình, nói rõ và hướng dẫn bước tiếp theo. Không đoán.
- Trả lời tiếng Việt, ngắn, rõ. Có thể dùng danh sách.
- Chat không đặt/huỷ ghế Gala — chỉ hướng dẫn sang trang Gala khi tới lượt.
- Khi không có dữ liệu trong tool, nói không có thông tin chứ không suy diễn.
"""

GREETINGS = {"xin chào", "xin chao", "chào", "chao", "chào bạn", "hello", "hi", "hey", "alo"}

GENERIC_ERROR = "Trợ lý tạm thời không trả lời được, vui lòng thử lại."

# Bare continuations like "còn chiều về?" or "thế còn phòng?" carry no meaning
# without the previous turn. Matched against the accent-folded query so it
# catches both "còn..." and the unaccented "con...". Used only to decide
# whether to fold the prior question into a fallback search — NOT a
# general-purpose rewrite, so a new, unrelated question right after another
# fallback-search turn is never forced to drag the old topic along and
# pollute retrieval with it (a real bug caught in browser testing: "Gala mặc
# gì?" then "thời tiết Đà Nẵng thế nào?" must not search on both combined).
_FOLLOWUP = re.compile(r"^(con|vay|the)\b", re.IGNORECASE)


def _looks_like_followup(query: str) -> bool:
    return bool(_FOLLOWUP.search(_fold(query).strip()))


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _is_chitchat(query: str) -> bool:
    s = _fold(query).strip().rstrip("!?.…")
    return s in {_fold(g) for g in GREETINGS}


def _is_personal_flight_question(query: str) -> bool:
    """Recognise a direct request for the caller's published flight.

    These answers are factual and already live in the journey data. Asking an
    LLM to decide whether to call its journey tool made it occasionally search
    the public FAQ instead, even after the flight had been published.
    """
    text = _fold(query)
    asks_about_self = bool(re.search(r"\b(toi|minh|tui|em|cua toi|cua minh)\b", text))
    asks_about_flight = "chuyen bay" in text or bool(re.search(r"\bbay\b", text))
    return asks_about_self and asks_about_flight


def _flight_direction(query: str) -> str | None:
    # Unicode NFKD does not turn Vietnamese "đ" into "d".
    text = _fold(query).replace("đ", "d")
    if "chieu di" in text or "luot di" in text:
        return "outbound"
    if "chieu ve" in text or "luot ve" in text:
        return "inbound"
    return None


async def _personal_flight_response(ctx: ToolContext, query: str) -> tuple[str, list[dict], dict]:
    data, citations = await get_my_journey(ctx, section="flights")
    if not data.get("published"):
        return data["message"], citations, data

    direction = _flight_direction(query)
    flights = data.get("flights", [])
    if direction is not None:
        flights = [flight for flight in flights if flight.get("direction") == direction]

    direction_label = "chiều đi" if direction == "outbound" else "chiều về" if direction == "inbound" else ""
    if not flights:
        qualifier = f" {direction_label}" if direction_label else ""
        return f"Hành trình đã công bố chưa có chuyến bay{qualifier} của bạn.", citations, data

    details = []
    for flight in flights:
        route = " → ".join(part for part in (flight.get("origin"), flight.get("destination")) if part)
        detail = flight["flight_code"]
        if flight.get("airline"):
            detail = f"{flight['airline']} {detail}"
        if route:
            detail = f"{detail} ({route})"
        details.append(detail)
    prefix = f"Chuyến bay {direction_label} của bạn" if direction_label else "Chuyến bay của bạn"
    return f"{prefix}: **{' ; '.join(details)}**.", citations, data


def _user_turns(history: list[dict]) -> int:
    return sum(1 for m in history if m.get("role") == "user")


def _last_user_message(history: list[dict]) -> str | None:
    for m in reversed(history):
        if m.get("role") == "user":
            return m.get("content")
    return None


def _system_prompt(event: Event, employee: Employee | None) -> str:
    full_name = employee.full_name if employee is not None else "CBNV"
    team_bit = ""
    if employee is not None and employee.team is not None:
        team_bit = f", Team {employee.team.name}"
    return SYSTEM_TEMPLATE.format(
        event_name=event.name,
        full_name=full_name,
        team_bit=team_bit,
        status=event.status.value,
    )


def empty_response_for(event: Event, kind: str = "generic") -> str:
    status = event.status.value
    if kind == "unpublished":
        return (
            "BTC chưa công bố hành trình (chuyến bay, xe, phòng). "
            "Bạn vẫn hỏi được quy định, hạn đăng ký và thông tin đã nộp trên form."
        )
    if kind == "no_knowledge":
        return (
            "Tài liệu sự kiện chưa có thông tin này. "
            "Bạn thử hỏi về hành trình của mình, hoặc liên hệ BTC."
        )
    if status == "registration_open":
        return (
            "Mình chưa tìm thấy thông tin đó. Bạn có thể hỏi hạn đăng ký, quy định chương trình, "
            "hoặc nội dung form đã nộp."
        )
    if status in ("registration_closed", "allocation_processing"):
        return (
            "BTC đang phân bổ, hành trình chưa công bố. "
            "Mình chỉ trả lời được đăng ký đã nộp và tài liệu BTC đã đăng."
        )
    return "Mình không có đủ thông tin để trả lời chính xác. Vui lòng xem trang Hành trình hoặc hỏi BTC."


def _dedupe_citations(citations: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for c in citations:
        key = (c.get("title"), c.get("source_type"), c.get("href"))
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def _chunk_trace(result: dict) -> list[dict]:
    """Compact {id, score} summary of a search_event_knowledge result, for
    tool_trace — enough to spot a wrong answer without logging full content."""
    return [{"id": c["id"], "score": c["score"]} for c in result.get("chunks", []) if "id" in c]


async def answer_stream(
    db: AsyncSession,
    event: Event,
    user: User,
    query: str,
    history: list[dict],
) -> AsyncIterator[dict]:
    """Yield SSE-shaped dicts: tool/delta/done/error. Caller persists the answer."""
    employee = user.employee
    ctx = ToolContext(db=db, event=event, user=user)
    system = _system_prompt(event, employee)

    if _is_chitchat(query) and _user_turns(history) == 0:
        hello = (
            f"Xin chào{(' ' + employee.full_name) if employee else ''}. "
            "Mình trả lời thông tin sự kiện của bạn (đăng ký, hành trình đã công bố, "
            "quy định, Gala). Không xem được dữ liệu người khác."
        )
        yield {"delta": hello}
        yield {"done": True, "citations": [], "tool_trace": [], "text": hello}
        return

    llm = get_llm_provider()
    messages: list[dict] = [
        m for m in history if m.get("role") in ("user", "assistant")
    ][-HISTORY_LIMIT:]
    messages.append({"role": "user", "content": query})

    citations: list[dict] = []
    tool_trace: list[dict] = []
    tools_ran: set[str] = set()

    if _is_personal_flight_question(query):
        yield {"tool": "get_my_journey"}
        text, citations, result = await _personal_flight_response(ctx, query)
        tool_trace.append({
            "name": "get_my_journey",
            "arguments": {"section": "flights"},
            "ok": "error" not in result,
        })
        yield {"delta": text}
        yield {"done": True, "citations": citations, "tool_trace": tool_trace, "text": text}
        return

    for _round in range(MAX_TOOL_ROUNDS):
        try:
            response = await llm.complete(system, messages, tools=OPENAI_TOOLS)
        except Exception:
            logger.exception("LLM complete failed")
            yield {"error": GENERIC_ERROR}
            return

        if not response.tool_calls:
            # Content without tools is only trustworthy after a tool round.
            # Otherwise fall through to knowledge search so the model cannot
            # invent dress codes / penalties from thin air.
            if tools_ran and response.content:
                yield {"delta": response.content}
                yield {
                    "done": True,
                    "citations": _dedupe_citations(citations),
                    "tool_trace": tool_trace,
                    "text": response.content,
                }
                return
            break

        messages.append({
            "role": "assistant",
            "content": response.content or None,
            "tool_calls": [tc.raw or {
                "id": tc.id, "type": "function",
                "function": {"name": tc.name, "arguments": json.dumps(tc.arguments, ensure_ascii=False)},
            } for tc in response.tool_calls],
        })
        for tc in response.tool_calls:
            yield {"tool": tc.name}
            result, cites = await execute_tool(ctx, tc.name, tc.arguments)
            tools_ran.add(tc.name)
            citations.extend(cites)
            trace_entry = {"name": tc.name, "arguments": tc.arguments, "ok": "error" not in result}
            if tc.name == "search_event_knowledge":
                trace_entry["chunks"] = _chunk_trace(result)
            tool_trace.append(trace_entry)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

    if not tools_ran and not _is_chitchat(query):
        # No rewrite step: only fold the previous user turn into the search
        # query when this one looks like a bare continuation ("còn chiều
        # về?"), never for an ordinary new question — see _FOLLOWUP above.
        prior = _last_user_message(history) if _looks_like_followup(query) else None
        search_query = f"{prior} {query}".strip() if prior else query
        yield {"tool": "search_event_knowledge"}
        result, cites = await search_event_knowledge(ctx, search_query)
        citations.extend(cites)
        tool_trace.append({
            "name": "search_event_knowledge", "arguments": {"query": search_query}, "ok": True,
            "chunks": _chunk_trace(result),
        })
        messages.append({
            "role": "user",
            "content": "Ngữ cảnh tài liệu tìm được (JSON):\n"
            + json.dumps(result, ensure_ascii=False, default=str),
        })
        if result.get("count") == 0:
            text = empty_response_for(event, "no_knowledge")
            yield {"delta": text}
            yield {"done": True, "citations": [], "tool_trace": tool_trace, "text": text}
            return

    chunks: list[str] = []
    try:
        async for delta in llm.stream(system, messages):
            chunks.append(delta)
            yield {"delta": delta}
    except Exception:
        logger.exception("LLM stream failed")
        yield {"error": GENERIC_ERROR}
        return

    text = "".join(chunks)
    yield {
        "done": True,
        "citations": _dedupe_citations(citations),
        "tool_trace": tool_trace,
        "text": text,
    }
