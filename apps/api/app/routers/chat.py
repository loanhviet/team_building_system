import json
import logging

from fastapi import APIRouter, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.db.session import AsyncSessionLocal
from app.models.rag import ChatMessage, ChatSession
from app.schemas.chat import ChatMessageCreate, ChatMessageOut, ChatSessionCreate, ChatSessionOut
from app.services.rag.chat_service import answer_stream

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger("app")


@router.post("/sessions", response_model=ChatSessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: ChatSessionCreate, db: DbSession, user: CurrentUser
) -> ChatSession:
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
    session_id: int, payload: ChatMessageCreate, db: DbSession, user: CurrentUser
) -> StreamingResponse:
    session = await _get_owned_session(db, session_id, user.id)

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.desc())
        .limit(10)
    )
    history = [{"role": m.role, "content": m.content} for m in reversed(result.scalars().all())]

    db.add(ChatMessage(session_id=session_id, role="user", content=payload.content))
    await db.commit()

    stream, citations = await answer_stream(
        session.event_id, user.employee_id, payload.content, history
    )

    async def event_source():
        chunks: list[str] = []
        try:
            async for delta in stream:
                chunks.append(delta)
                yield f"data: {json.dumps({'delta': delta})}\n\n"
        except Exception as exc:
            logger.exception("chat stream failed for session %s", session_id)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            return

        full_text = "".join(chunks)
        # A fresh session here, not the request-scoped `db` — by the time this
        # generator resumes after the first yield, FastAPI may already have
        # closed the request's DB dependency.
        async with AsyncSessionLocal() as write_db:
            write_db.add(
                ChatMessage(
                    session_id=session_id, role="assistant", content=full_text,
                    citations_json=citations,
                )
            )
            await write_db.commit()

        yield f"data: {json.dumps({'done': True, 'citations': citations})}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")
