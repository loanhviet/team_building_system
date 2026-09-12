import json
import logging
from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.core.queue import get_queue
from app.db.session import AsyncSessionLocal
from app.models.auth import User
from app.models.event import Event
from app.models.rag import ChatMessage, ChatSession
from app.schemas.chat import ChatMessageCreate, ChatMessageOut, ChatSessionCreate, ChatSessionOut
from app.services.rag.access import event_for_chat
from app.services.rag.chat_service import answer_stream
from app.services.rag.rate_limit import check_chat_rate

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger("app")


@router.post("/sessions", response_model=ChatSessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: ChatSessionCreate, db: DbSession, user: CurrentUser
) -> ChatSession:
    await event_for_chat(db, user, payload.event_id)
    session = ChatSession(user_id=user.id, event_id=payload.event_id, title=payload.title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions", response_model=list[ChatSessionOut])
async def list_sessions(
    db: DbSession, user: CurrentUser, event_id: int | None = None
) -> list[ChatSession]:
    stmt = select(ChatSession).where(ChatSession.user_id == user.id)
    if event_id is not None:
        await event_for_chat(db, user, event_id)
        stmt = stmt.where(ChatSession.event_id == event_id)
    result = await db.execute(stmt.order_by(ChatSession.created_at.desc()))
    return list(result.scalars().all())


async def _get_owned_session(db: DbSession, session_id: int, user_id: int) -> ChatSession:
    session = await db.get(ChatSession, session_id)
    if session is None or session.user_id != user_id:
        raise AppError("not_found", "Chat session not found", status.HTTP_404_NOT_FOUND)
    return session


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageOut])
async def list_messages(
    session_id: int, db: DbSession, user: CurrentUser
) -> list[ChatMessage]:
    await _get_owned_session(db, session_id, user.id)
    result = await db.execute(
        select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.id)
    )
    return list(result.scalars().all())


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: int,
    payload: ChatMessageCreate,
    db: DbSession,
    user: CurrentUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> StreamingResponse:
    await check_chat_rate(queue, user.id)
    session = await _get_owned_session(db, session_id, user.id)
    await event_for_chat(db, user, session.event_id)

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.desc())
        .limit(10)
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(result.scalars().all())]

    content = (payload.content or "").strip()
    if not content:
        raise AppError("validation_error", "Nội dung trống", status.HTTP_400_BAD_REQUEST)

    db.add(ChatMessage(session_id=session_id, role="user", content=content))
    await db.commit()

    user_id = user.id
    event_id = session.event_id
    query = content

    async def event_source():
        chunks: list[str] = []
        citations: list[dict] = []
        tool_trace: list[dict] = []
        try:
            async with AsyncSessionLocal() as write_db:
                result = await write_db.execute(
                    select(User).options(selectinload(User.employee)).where(User.id == user_id)
                )
                live_user = result.scalar_one()
                event = await write_db.get(Event, event_id)
                if event is None:
                    yield f"data: {json.dumps({'error': 'Sự kiện không tồn tại'})}\n\n"
                    return
                async for evt in answer_stream(write_db, event, live_user, query, history):
                    if evt.get("delta"):
                        chunks.append(evt["delta"])
                    if evt.get("citations") is not None:
                        citations = evt["citations"]
                    if evt.get("tool_trace") is not None:
                        tool_trace = evt["tool_trace"]
                    if evt.get("error"):
                        yield f"data: {json.dumps({'error': evt['error']})}\n\n"
                        return
                    out = {k: v for k, v in evt.items() if k not in ("text", "tool_trace")}
                    if out.get("done"):
                        out["citations"] = citations
                    yield f"data: {json.dumps(out, ensure_ascii=False)}\n\n"
        except Exception as exc:
            logger.exception("chat stream failed for session %s", session_id)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            return

        full_text = "".join(chunks)
        async with AsyncSessionLocal() as write_db:
            write_db.add(
                ChatMessage(
                    session_id=session_id, role="assistant", content=full_text,
                    citations_json=citations or None,
                    tool_trace_json=tool_trace or None,
                )
            )
            await write_db.commit()

    return StreamingResponse(event_source(), media_type="text/event-stream")
