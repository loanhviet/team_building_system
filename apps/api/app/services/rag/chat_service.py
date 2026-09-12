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
from app.services.rag.tools import OPENAI_TOOLS, ToolContext, execute_tool, search_event_knowledge

logger = logging.getLogger("app")

MAX_TOOL_ROUNDS = 3
HISTORY_LIMIT = 8

REWRITE_SYSTEM = (
    "Nhiệm vụ DUY NHẤT: viết lại câu hỏi cuối thành một câu hỏi độc lập, tiếng Việt. "
    "Không trả lời. Không thêm thông tin mới. Không liệt kê quy định. "
    "Nếu câu cuối đã đủ nghĩa, in lại nguyên văn. Chỉ in câu hỏi, không giải thích."
)

_FOLLOWUP = re.compile(
    r"^(còn|vậy|thế|thế thì|còn về|còn chiều|còn phòng|còn xe|còn bay)\b",
    re.IGNORECASE,
)

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


def _fold(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _is_chitchat(query: str) -> bool:
    s = _fold(query).strip().rstrip("!?.…")
    return s in {_fold(g) for g in GREETINGS}


def _user_turns(history: list[dict]) -> int:
    return sum(1 for m in history if m.get("role") == "user")


def _needs_rewrite(history: list[dict], query: str) -> bool:
    if _user_turns(history) < 1:
        return False
    q = query.strip()
    if _FOLLOWUP.search(q):
        return True
    # Pronoun-only / very short follow-ups like "còn chiều về?" or "phòng nào?"
    return len(q.split()) <= 4


def _rewrite_looks_like_answer(text: str) -> bool:
    s = text.strip()
    if len(s) > 180:
        return True
    if s.count("\n") >= 2:
        return True
    lowered = s.lower()
    return lowered.startswith(("đây là", "yêu cầu", "bạn nhớ", "cảm ơn", "- "))


async def rewrite_query(history: list[dict], query: str) -> str:
    if not _needs_rewrite(history, query):
        return query
    llm = get_llm_provider()
    messages = [m for m in history if m.get("role") in ("user", "assistant")][-HISTORY_LIMIT:]
    messages.append({"role": "user", "content": query})
    try:
        rewritten = (await llm.generate(REWRITE_SYSTEM, messages)).strip().strip('"')
    except Exception:
        logger.warning("query rewrite failed, using original", exc_info=True)
        return query
    if not rewritten or len(rewritten) > 240 or _rewrite_looks_like_answer(rewritten):
        return query
    return rewritten


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


async def answer_stream(
    db: AsyncSession,
    event: Event,
    user: User,
    query: str,
    history: list[dict],
) -> AsyncIterator[dict]:
    """Yield SSE-shaped dicts: rewrite/tool/delta/error. Caller persists the answer."""
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

    standalone = await rewrite_query(history, query)
    if standalone != query:
        yield {"rewrite": standalone}

    llm = get_llm_provider()
    messages: list[dict] = [
        m for m in history if m.get("role") in ("user", "assistant")
    ][-HISTORY_LIMIT:]
    messages.append({"role": "user", "content": standalone})

    citations: list[dict] = []
    tool_trace: list[dict] = []
    tools_ran: set[str] = set()

    for _round in range(MAX_TOOL_ROUNDS):
        try:
            response = await llm.complete(system, messages, tools=OPENAI_TOOLS)
        except Exception as exc:
            logger.exception("LLM complete failed")
            yield {"error": str(exc)}
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
            tool_trace.append({"name": tc.name, "arguments": tc.arguments, "ok": "error" not in result})
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": json.dumps(result, ensure_ascii=False, default=str),
            })

    if not tools_ran and not _is_chitchat(standalone):
        yield {"tool": "search_event_knowledge"}
        result, cites = await search_event_knowledge(ctx, standalone)
        citations.extend(cites)
        tool_trace.append({
            "name": "search_event_knowledge", "arguments": {"query": standalone}, "ok": True,
        })
        messages.append({
            "role": "user",
            "content": "Ngữ cảnh tài liệu tìm được (JSON):\n"
            + json.dumps(result, ensure_ascii=False, default=str),
        })
        if result.get("count") == 0 and not tools_ran:
            text = empty_response_for(event, "no_knowledge")
            yield {"delta": text}
            yield {"done": True, "citations": [], "tool_trace": tool_trace, "text": text}
            return

    chunks: list[str] = []
    try:
        async for delta in llm.stream(system, messages):
            chunks.append(delta)
            yield {"delta": delta}
    except Exception as exc:
        logger.exception("LLM stream failed")
        yield {"error": str(exc)}
        return

    text = "".join(chunks)
    yield {
        "done": True,
        "citations": _dedupe_citations(citations),
        "tool_trace": tool_trace,
        "text": text,
    }
