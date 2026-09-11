from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, require_admin
from app.models.auth import User
from app.models.enums import EventStatus
from app.models.event import Event
from app.schemas.event import EventCreate, EventOut, EventTransition, EventUpdate
from app.schemas.registration import EventTermsOut
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.event_service import get_setting, transition_event

router = APIRouter(prefix="/events", tags=["events"])

AdminUser = Annotated[User, Depends(require_admin)]


def _event_out(event: Event) -> EventOut:
    return EventOut(
        id=event.id,
        code=event.code,
        name=event.name,
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date,
        destination=event.destination,
        status=event.status.value,
        registration_open_at=event.registration_open_at,
        registration_close_at=event.registration_close_at,
        published_at=event.published_at,
    )


@router.get("", response_model=list[EventOut])
async def list_events(db: DbSession, _user: CurrentUser) -> list[EventOut]:
    events = await master_data.list_all(db, Event)
    return [_event_out(e) for e in events]


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(payload: EventCreate, db: DbSession, user: AdminUser) -> EventOut:
    event = await master_data.create(db, Event, payload.model_dump())
    await record_audit(
        db,
        actor_user_id=user.id,
        action="create",
        entity_type="event",
        entity_id=event.id,
        after=payload.model_dump(mode="json"),
        event_id=event.id,
    )
    await db.commit()
    await db.refresh(event)
    return _event_out(event)


@router.get("/current", response_model=EventOut | None)
async def get_current_event(db: DbSession, _user: CurrentUser) -> EventOut | None:
    """The single event employees register against — the most recently opened
    one still accepting registrations. Returns null when none is open."""
    result = await db.execute(
        select(Event)
        .where(Event.status == EventStatus.registration_open)
        .order_by(Event.registration_open_at.desc().nulls_last(), Event.id.desc())
        .limit(1)
    )
    event = result.scalar_one_or_none()
    return _event_out(event) if event else None


@router.get("/{event_id}/terms", response_model=EventTermsOut)
async def get_event_terms(event_id: int, db: DbSession, _user: CurrentUser) -> EventTermsOut:
    await master_data.get_or_404(db, Event, event_id)
    terms_text = await get_setting(
        db,
        event_id,
        "terms_text",
        "Tôi xác nhận đã đọc và đồng ý với quy định chương trình Team Building, "
        "bao gồm chính sách/phí phạt trong trường hợp huỷ đăng ký không đúng quy định.",
    )
    terms_version = await get_setting(db, event_id, "terms_version", "v1")
    return EventTermsOut(terms_text=terms_text, terms_version=terms_version)


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: int, db: DbSession, _user: CurrentUser) -> EventOut:
    event = await master_data.get_or_404(db, Event, event_id)
    return _event_out(event)


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int, payload: EventUpdate, db: DbSession, user: AdminUser
) -> EventOut:
    event = await master_data.get_or_404(db, Event, event_id)
    before = _event_out(event).model_dump(mode="json")
    await master_data.update(db, event, payload.model_dump(exclude_unset=True))
    await record_audit(
        db,
        actor_user_id=user.id,
        action="update",
        entity_type="event",
        entity_id=event_id,
        before=before,
        after=_event_out(event).model_dump(mode="json"),
        event_id=event_id,
    )
    await db.commit()
    await db.refresh(event)
    return _event_out(event)


@router.post("/{event_id}/transition", response_model=EventOut)
async def transition_event_status(
    event_id: int, payload: EventTransition, db: DbSession, user: AdminUser
) -> EventOut:
    event = await master_data.get_or_404(db, Event, event_id)
    before_status = event.status.value
    transition_event(event, payload.status, user.role)
    await record_audit(
        db,
        actor_user_id=user.id,
        action="transition",
        entity_type="event",
        entity_id=event_id,
        before={"status": before_status},
        after={"status": event.status.value},
        event_id=event_id,
    )
    await db.commit()
    await db.refresh(event)
    return _event_out(event)
