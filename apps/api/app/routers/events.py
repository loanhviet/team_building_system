from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.time import utcnow
from app.models.auth import User
from app.models.enums import EventStatus
from app.models.event import Event
from app.models.registration import Registration
from app.schemas.event import (
    EmployeeEventOut,
    EventCreate,
    EventOut,
    EventSettingsOut,
    EventSettingsUpdate,
    EventTransition,
    EventUpdate,
)
from app.schemas.organization import TeamRosterOut
from app.schemas.registration import EventTermsOut
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.event_service import (
    DEFAULT_TERMS_TEXT,
    DEFAULT_TERMS_VERSION,
    get_event_settings,
    get_setting,
    is_accepting_registration,
    save_event_settings,
    transition_event,
)
from app.services.journey_service import PUBLISHED_STATUSES
from app.services.notification.email_service import (
    describe_event_changes,
    notify_employees,
    participating_employee_ids,
)
from app.services.rag.enqueue import enqueue_reindex_fire_and_forget
from app.services.readiness_service import build_publish_readiness
from app.services.team_roster_service import build_team_roster, resolve_roster_team_id

router = APIRouter(prefix="/events", tags=["events"])

AdminUser = Annotated[User, Depends(require_admin)]


def _validate_event_ranges(event: Event, data: dict) -> None:
    start_date = data.get("start_date", event.start_date)
    end_date = data.get("end_date", event.end_date)
    open_at = data.get("registration_open_at", event.registration_open_at)
    close_at = data.get("registration_close_at", event.registration_close_at)
    if start_date and end_date and end_date < start_date:
        raise AppError("invalid_event_dates", "Ngày kết thúc không được trước ngày bắt đầu", status.HTTP_400_BAD_REQUEST)
    if open_at and close_at and close_at <= open_at:
        raise AppError("invalid_registration_window", "Thời gian đóng đăng ký phải sau thời gian mở", status.HTTP_400_BAD_REQUEST)


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
async def list_events(db: DbSession, _user: AdminUser) -> list[EventOut]:
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
        .where(
            Event.status == EventStatus.registration_open,
            (Event.registration_open_at.is_(None) | (Event.registration_open_at <= utcnow())),
            (Event.registration_close_at.is_(None) | (Event.registration_close_at >= utcnow())),
        )
        .order_by(Event.registration_open_at.desc().nulls_last(), Event.id.desc())
        .limit(1)
    )
    event = result.scalar_one_or_none()
    return _event_out(event) if event else None


@router.get("/mine", response_model=list[EmployeeEventOut])
async def list_my_events(db: DbSession, user: CurrentUser) -> list[EmployeeEventOut]:
    """Events this CBNV may open: currently accepting registration, or ones
    they already submitted for. Drafts they never touched stay hidden."""
    by_id: dict[int, EmployeeEventOut] = {}

    open_result = await db.execute(
        select(Event).where(
            Event.status == EventStatus.registration_open,
            (Event.registration_open_at.is_(None) | (Event.registration_open_at <= utcnow())),
            (Event.registration_close_at.is_(None) | (Event.registration_close_at >= utcnow())),
        )
    )
    for event in open_result.scalars().all():
        by_id[event.id] = EmployeeEventOut(
            **_event_out(event).model_dump(),
            can_register=True,
            has_journey=False,
            registration_status=None,
        )

    if user.employee_id is not None:
        owned = await db.execute(
            select(Event, Registration).join(
                Registration, Registration.event_id == Event.id
            ).where(Registration.employee_id == user.employee_id)
        )
        for event, reg in owned.all():
            row = by_id.get(event.id) or EmployeeEventOut(
                **_event_out(event).model_dump(),
                can_register=is_accepting_registration(event),
                has_journey=False,
                registration_status=None,
            )
            row.registration_status = reg.status
            row.can_register = is_accepting_registration(event)
            row.has_journey = (
                reg.status == "submitted"
                and reg.is_participating is True
                and event.status.value in PUBLISHED_STATUSES
            )
            by_id[event.id] = row

    return sorted(by_id.values(), key=lambda e: e.id, reverse=True)


@router.get("/{event_id}/terms", response_model=EventTermsOut)
async def get_event_terms(event_id: int, db: DbSession, _user: CurrentUser) -> EventTermsOut:
    await master_data.get_or_404(db, Event, event_id)
    terms_text = await get_setting(db, event_id, "terms_text", DEFAULT_TERMS_TEXT)
    terms_version = await get_setting(db, event_id, "terms_version", DEFAULT_TERMS_VERSION)
    return EventTermsOut(terms_text=str(terms_text), terms_version=str(terms_version))


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: int, db: DbSession, _user: CurrentUser) -> EventOut:
    event = await master_data.get_or_404(db, Event, event_id)
    return _event_out(event)


@router.patch("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> EventOut:
    event = await master_data.get_or_404(db, Event, event_id)
    before = _event_out(event).model_dump(mode="json")
    data = payload.model_dump(exclude_unset=True)
    _validate_event_ranges(event, data)
    await master_data.update(db, event, data)
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

    after = _event_out(event).model_dump(mode="json")
    summary = describe_event_changes(before, after)
    if summary:
        employee_ids = await participating_employee_ids(db, event_id)
        if employee_ids:
            await notify_employees(
                db,
                queue,
                event,
                employee_ids,
                "schedule_changed",
                dedupe_suffix=f"event:{event.updated_at.isoformat()}",
                extra_context={"change_summary": summary},
            )
    return _event_out(event)


@router.get("/{event_id}/settings", response_model=EventSettingsOut)
async def get_settings(event_id: int, db: DbSession, _user: AdminUser) -> EventSettingsOut:
    await master_data.get_or_404(db, Event, event_id)
    data = await get_event_settings(db, event_id)
    return EventSettingsOut(**data)


@router.put("/{event_id}/settings", response_model=EventSettingsOut)
async def update_settings(
    event_id: int,
    payload: EventSettingsUpdate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> EventSettingsOut:
    await master_data.get_or_404(db, Event, event_id)
    before = await get_event_settings(db, event_id)
    data = await save_event_settings(
        db,
        event_id,
        terms_text=payload.terms_text,
        terms_version=payload.terms_version,
        flight_allocation_weights=payload.flight_allocation_weights,
        bus_allocation_weights=payload.bus_allocation_weights,
    )
    await record_audit(
        db,
        actor_user_id=user.id,
        action="update",
        entity_type="event_settings",
        entity_id=event_id,
        before=before,
        after=data,
        event_id=event_id,
    )
    await db.commit()
    await enqueue_reindex_fire_and_forget(queue, event_id)
    return EventSettingsOut(**data)


@router.post("/{event_id}/transition", response_model=EventOut)
async def transition_event_status(
    event_id: int,
    payload: EventTransition,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> EventOut:
    event = await master_data.get_or_404(db, Event, event_id)
    if payload.status == EventStatus.information_published:
        readiness = await build_publish_readiness(db, event_id)
        if not readiness["ready"]:
            raise AppError(
                "publish_blocked",
                "; ".join(item["message"] for item in readiness["blockers"]),
                status.HTTP_409_CONFLICT,
            )
        if readiness["requires_confirmation"] and not payload.confirm_warnings:
            raise AppError(
                "publish_confirmation_required",
                "; ".join(item["message"] for item in readiness["warnings"]),
                status.HTTP_409_CONFLICT,
            )
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

    if payload.status == EventStatus.information_published:
        await queue.enqueue_job("send_bulk_emails_task", event_id, "info_published")
        # No reindex here: journeys/hotels aren't indexed (served live by
        # chat tools), and this transition doesn't publish any knowledge text.

    return _event_out(event)


@router.get("/{event_id}/readiness")
async def get_publish_readiness(event_id: int, db: DbSession, _user: AdminUser) -> dict:
    await master_data.get_or_404(db, Event, event_id)
    return await build_publish_readiness(db, event_id)


@router.get("/{event_id}/team/roster", response_model=TeamRosterOut)
async def get_team_roster(
    event_id: int,
    db: DbSession,
    user: CurrentUser,
    team_id: int | None = None,
) -> TeamRosterOut:
    resolved_team_id = resolve_roster_team_id(user, team_id)
    return await build_team_roster(db, event_id, resolved_team_id)
