from collections.abc import AsyncIterator

from app.services.rag.providers import get_embedding_provider, get_llm_provider
from app.services.rag.qdrant_store import search

SYSTEM_TEMPLATE = (
    "Bạn là trợ lý hỏi đáp thông tin cho một chuyến Team Building. "
    "CHỈ được trả lời dựa trên phần NGỮ CẢNH bên dưới — không suy đoán hay bịa thông tin. "
    "Nếu ngữ cảnh không có đủ thông tin để trả lời, hãy nói rõ là bạn không có thông tin đó. "
    "Luôn trả lời ngắn gọn bằng tiếng Việt.\n\nNGỮ CẢNH:\n{context}"
)


async def retrieve(event_id: int, employee_id: int | None, query: str, top_k: int = 5) -> list[dict]:
    embedder = get_embedding_provider()
    [vector] = await embedder.embed([query])
    return await search(vector, event_id, employee_id, limit=top_k)


def _build_system_prompt(chunks: list[dict]) -> str:
    if not chunks:
        context = "(không tìm thấy tài liệu liên quan)"
    else:
        context = "\n\n".join(f"[{i + 1}] {c['title']}: {c['content']}" for i, c in enumerate(chunks))
    return SYSTEM_TEMPLATE.format(context=context)


def citations_from(chunks: list[dict]) -> list[dict]:
    return [{"title": c["title"], "source_type": c["source_type"]} for c in chunks]


async def answer(
    event_id: int, employee_id: int | None, query: str, history: list[dict]
) -> tuple[str, list[dict]]:
    chunks = await retrieve(event_id, employee_id, query)
    system = _build_system_prompt(chunks)
    llm = get_llm_provider()
    messages = [*history, {"role": "user", "content": query}]
    text = await llm.generate(system, messages)
    return text, citations_from(chunks)


async def answer_stream(
    event_id: int, employee_id: int | None, query: str, history: list[dict]
) -> tuple[AsyncIterator[str], list[dict]]:
    chunks = await retrieve(event_id, employee_id, query)
    system = _build_system_prompt(chunks)
    llm = get_llm_provider()
    messages = [*history, {"role": "user", "content": query}]
    return llm.stream(system, messages), citations_from(chunks)
