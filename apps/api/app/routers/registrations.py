import io
from collections import defaultdict
from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.models.auth import User
from app.models.enums import EventStatus
from app.models.event import Event, PickupPoint, Shift, TransportLeg
from app.models.organization import Employee
from app.models.registration import Registration, RegistrationTransportNeed
from app.schemas.registration import (
    RegistrationAdminOut,
    RegistrationCancel,
    RegistrationOut,
    RegistrationSubmit,
    RegistrationUpdate,
    TransportNeedOut,
)
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.notification.email_service import dispatch_email, enqueue_email
from app.services.registration_service import (
    assert_can_edit,
    cancel_registration,
    get_or_create_registration,
    replace_transport_needs,
    submit_registration,
)

router = APIRouter(prefix="/events/{event_id}/registrations", tags=["registrations"])
# Unscoped counterpart to `GET /events/{event_id}/registrations/me`: once an
# event leaves registration_open, GET /events/current returns null, so the
# CBNV frontend has no event_id left to ask the scoped endpoint with — they'd
# lose the ability to see what they submitted the moment the window closed.
# This lets the register page find "my most relevant registration" without
# already knowing which event it belongs to.
me_router = APIRouter(prefix="/registrations", tags=["registrations"])

AdminUser = Annotated[User, Depends(require_admin)]
settings = get_settings()


async def _current_employee(db: DbSession, user: User) -> Employee:
    if user.employee_id is None:
        raise AppError(
            "no_employee_record",
            "Tài khoản này không gắn với hồ sơ nhân viên nên không thể đăng ký",
            status.HTTP_400_BAD_REQUEST,
        )
    employee = await db.get(Employee, user.employee_id)
    if employee is None:
        raise AppError("not_found", "Employee not found", status.HTTP_404_NOT_FOUND)
    return employee


async def _registration_out(db: DbSession, reg: Registration) -> RegistrationOut:
    result = await db.execute(
        select(RegistrationTransportNeed).where(
            RegistrationTransportNeed.registration_id == reg.id
        )
    )
    needs = result.scalars().all()
    return RegistrationOut(
        id=reg.id,
        event_id=reg.event_id,
        employee_id=reg.employee_id,
        status=reg.status,
        is_participating=reg.is_participating,
        shift_id=reg.shift_id,
        wish_note=reg.wish_note,
        terms_version=reg.terms_version,
        submitted_at=reg.submitted_at,
        cancelled_at=reg.cancelled_at,
        transport_needs=[TransportNeedOut.model_validate(n) for n in needs],
    )


@me_router.get("/me", response_model=RegistrationOut | None)
async def get_my_latest_registration(db: DbSession, user: CurrentUser) -> RegistrationOut | None:
    """The most recent registration for this employee whose event hasn't
    fully wrapped up — doesn't auto-create a draft (unlike the scoped
    endpoint), since there may be no event_id to create one against."""
    employee = await _current_employee(db, user)
    result = await db.execute(
        select(Registration)
        .join(Event, Event.id == Registration.event_id)
        .where(
            Registration.employee_id == employee.id,
            Event.status != EventStatus.event_completed,
        )
        .order_by(Registration.id.desc())
        .limit(1)
    )
    reg = result.scalar_one_or_none()
    return await _registration_out(db, reg) if reg is not None else None


@router.get("/me", response_model=RegistrationOut)
async def get_my_registration(event_id: int, db: DbSession, user: CurrentUser) -> RegistrationOut:
    employee = await _current_employee(db, user)
    await master_data.get_or_404(db, Event, event_id)
    reg = await get_or_create_registration(db, event_id, employee.id)
    await db.commit()
    return await _registration_out(db, reg)


@router.put("/me", response_model=RegistrationOut)
async def update_my_registration(
    event_id: int, payload: RegistrationUpdate, db: DbSession, user: CurrentUser
) -> RegistrationOut:
    employee = await _current_employee(db, user)
    event = await master_data.get_or_404(db, Event, event_id)
    reg = await get_or_create_registration(db, event_id, employee.id)
    assert_can_edit(event, reg)

    data = payload.model_dump(exclude={"transport_needs"}, exclude_unset=True)
    if data.get("shift_id") is not None:
        shift = await db.get(Shift, data["shift_id"])
        if shift is None or shift.event_id != event_id:
            raise AppError("invalid_shift", "Ca không thuộc sự kiện này", status.HTTP_400_BAD_REQUEST)
    for key, value in data.items():
        setattr(reg, key, value)

    if payload.transport_needs is not None:
        leg_ids = {n.leg_id for n in payload.transport_needs}
        pickup_ids = {n.pickup_point_id for n in payload.transport_needs if n.pickup_point_id is not None}
        if leg_ids:
            result = await db.execute(
                select(TransportLeg.id).where(
                    TransportLeg.event_id == event_id, TransportLeg.id.in_(leg_ids)
                )
            )
            if {row[0] for row in result.all()} != leg_ids:
                raise AppError(
                    "invalid_leg", "Chặng xe không thuộc sự kiện này", status.HTTP_400_BAD_REQUEST
                )
        if pickup_ids:
            result = await db.execute(
                select(PickupPoint.id).where(
                    PickupPoint.event_id == event_id, PickupPoint.id.in_(pickup_ids)
                )
            )
            if {row[0] for row in result.all()} != pickup_ids:
                raise AppError(
                    "invalid_pickup_point", "Điểm đón không thuộc sự kiện này",
                    status.HTTP_400_BAD_REQUEST,
                )
        await replace_transport_needs(
            db, reg.id, [n.model_dump() for n in payload.transport_needs]
        )

    await db.commit()
    return await _registration_out(db, reg)


@router.post("/me/submit", response_model=RegistrationOut)
async def submit_my_registration(
    event_id: int,
    payload: RegistrationSubmit,
    db: DbSession,
    user: CurrentUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> RegistrationOut:
    employee = await _current_employee(db, user)
    event = await master_data.get_or_404(db, Event, event_id)
    reg = await get_or_create_registration(db, event_id, employee.id)
    assert_can_edit(event, reg)

    submit_registration(
        reg,
        is_participating=payload.is_participating,
        agreed_terms=payload.agreed_terms,
        terms_version=payload.terms_version,
    )
    await db.flush()

    shift_name = None
    if reg.shift_id:
        shift = await db.get(Shift, reg.shift_id)
        shift_name = shift.name if shift else None

    result = await db.execute(
        select(RegistrationTransportNeed).where(RegistrationTransportNeed.registration_id == reg.id)
    )
    needs = result.scalars().all()
    needed_count = sum(1 for n in needs if n.is_needed)
    transport_summary = f"{needed_count} chặng" if needed_count else "Không có nhu cầu"

    # dedupe key is per-registration, not per-submission: submit_registration()
    # bumps submitted_at on every resubmit, so keying on it would send a fresh
    # "confirmed" email every time someone edits and resubmits before the
    # registration deadline instead of only once
    outbox_id = await enqueue_email(
        db,
        event_id=event_id,
        to_email=employee.email,
        template_code="registration_confirmed",
        payload={
            "full_name": employee.full_name,
            "event_name": event.name,
            "team_name": employee.team.name if employee.team else "—",
            "participating_label": "Có tham gia" if reg.is_participating else "Không tham gia",
            "shift_name": shift_name or "—",
            "transport_summary": transport_summary,
            "app_url": settings.app_base_url,
        },
        dedupe_key=f"registration_confirmed:{reg.id}",
    )

    await record_audit(
        db, actor_user_id=user.id, action="submit", entity_type="registration", entity_id=reg.id,
        after={"is_participating": reg.is_participating, "shift_id": reg.shift_id}, event_id=event_id,
    )
    await db.commit()
    await dispatch_email(queue, outbox_id)
    return await _registration_out(db, reg)


@router.post("/me/cancel", response_model=RegistrationOut)
async def cancel_my_registration(
    event_id: int, payload: RegistrationCancel, db: DbSession, user: CurrentUser
) -> RegistrationOut:
    employee = await _current_employee(db, user)
    event = await master_data.get_or_404(db, Event, event_id)
    reg = await get_or_create_registration(db, event_id, employee.id)
    assert_can_edit(event, reg)
    cancel_registration(reg, payload.reason)
    await record_audit(
        db, actor_user_id=user.id, action="cancel", entity_type="registration", entity_id=reg.id,
        reason=payload.reason, event_id=event_id,
    )
    await db.commit()
    return await _registration_out(db, reg)


async def _admin_list_query(
    db: DbSession,
    event_id: int,
    search: str | None,
    status_filter: str | None,
    team_id: int | None = None,
    shift_id: int | None = None,
):
    stmt = (
        select(Registration)
        .options(selectinload(Registration.employee).selectinload(Employee.team))
        .where(Registration.event_id == event_id)
        .join(Employee, Employee.id == Registration.employee_id)
    )
    if status_filter:
        stmt = stmt.where(Registration.status == status_filter)
    if search:
        needle = f"%{search.strip()}%"
        stmt = stmt.where(Employee.full_name.ilike(needle) | Employee.email.ilike(needle))
    if team_id is not None:
        stmt = stmt.where(Employee.team_id == team_id)
    if shift_id is not None:
        stmt = stmt.where(Registration.shift_id == shift_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("", response_model=list[RegistrationAdminOut])
async def list_registrations(
    event_id: int,
    db: DbSession,
    _user: AdminUser,
    search: str | None = None,
    status_filter: str | None = None,
    team_id: int | None = None,
    shift_id: int | None = None,
) -> list[RegistrationAdminOut]:
    regs = await _admin_list_query(db, event_id, search, status_filter, team_id, shift_id)
    shifts = {s.id: s.name for s in await master_data.list_all(db, Shift, event_id=event_id)}
    legs = {leg.id: leg.name for leg in await master_data.list_all(db, TransportLeg, event_id=event_id)}
    needs_by_reg: dict[int, list[str]] = defaultdict(list)
    if regs:
        need_result = await db.execute(
            select(RegistrationTransportNeed).where(
                RegistrationTransportNeed.registration_id.in_([r.id for r in regs]),
                RegistrationTransportNeed.is_needed.is_(True),
            )
        )
        for need in need_result.scalars().all():
            needs_by_reg[need.registration_id].append(legs.get(need.leg_id, f"#{need.leg_id}"))

    out = []
    for reg in regs:
        base = await _registration_out(db, reg)
        out.append(
            RegistrationAdminOut(
                **base.model_dump(),
                employee_code=reg.employee.employee_code,
                full_name=reg.employee.full_name,
                email=reg.employee.email,
                team_id=reg.employee.team_id,
                team_name=reg.employee.team.name if reg.employee.team else None,
                shift_name=shifts.get(reg.shift_id) if reg.shift_id else None,
                transport_summary=", ".join(needs_by_reg.get(reg.id, [])) or None,
            )
        )
    return out


@router.get("/export")
async def export_registrations(
    event_id: int,
    db: DbSession,
    _user: AdminUser,
    search: str | None = None,
    status_filter: str | None = None,
    team_id: int | None = None,
    shift_id: int | None = None,
) -> StreamingResponse:
    regs = await _admin_list_query(db, event_id, search, status_filter, team_id, shift_id)

    wb = Workbook()
    ws = wb.active
    ws.title = "Đăng ký"
    ws.append(["Mã NV", "Họ tên", "Email", "Team", "Trạng thái", "Tham gia", "Ca", "Mong muốn"])
    for reg in regs:
        ws.append([
            reg.employee.employee_code or "",
            reg.employee.full_name,
            reg.employee.email,
            reg.employee.team.name if reg.employee.team else "",
            reg.status,
            "Có" if reg.is_participating else ("Không" if reg.is_participating is False else ""),
            reg.shift_id or "",
            reg.wish_note or "",
        ])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=registrations_event_{event_id}.xlsx"},
    )
