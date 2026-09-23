import hashlib
import io
from collections import defaultdict
from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import delete, select, update
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.models.auth import User
from app.models.bus import BusAssignment
from app.models.enums import EventStatus
from app.models.event import Event, PickupPoint, Shift, TransportLeg
from app.models.flight import FlightAssignment
from app.models.gala import GalaSeat, GalaTable
from app.models.hotel import RoomAssignment
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
from app.services.event_service import (
    DEFAULT_TERMS_VERSION,
    get_setting,
    is_accepting_registration,
)
from app.services.notification.email_service import dispatch_email, enqueue_email
from app.services.registration_service import (
    assert_can_edit,
    cancel_registration,
    get_or_create_registration,
    remindable_employees,
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

# mirror of apps/web/src/lib/labels.ts — the export is the one place the API
# renders a label itself instead of handing the enum to the frontend
REGISTRATION_STATUS_LABELS = {
    "draft": "Nháp",
    "submitted": "Đã gửi",
    "cancelled": "Đã huỷ",
}


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


async def _remove_operational_assignments(db: DbSession, event_id: int, employee_id: int) -> None:
    for model in (FlightAssignment, RoomAssignment, BusAssignment):
        await db.execute(
            delete(model).where(model.event_id == event_id, model.employee_id == employee_id)
        )
    seat_ids = select(GalaSeat.id).join(GalaTable, GalaTable.id == GalaSeat.table_id).where(
        GalaTable.event_id == event_id, GalaSeat.employee_id == employee_id
    )
    await db.execute(
        update(GalaSeat).where(GalaSeat.id.in_(seat_ids)).values(employee_id=None)
    )


@me_router.get("/me", response_model=RegistrationOut | None)
async def get_my_latest_registration(
    db: DbSession, user: CurrentUser, event_id: int | None = None
) -> RegistrationOut | None:
    """The most recent registration for this employee whose event hasn't
    fully wrapped up — doesn't auto-create a draft (unlike the scoped
    endpoint), since there may be no event_id to create one against."""
    employee = await _current_employee(db, user)
    stmt = (
        select(Registration)
        .join(Event, Event.id == Registration.event_id)
        .where(Registration.employee_id == employee.id)
        .order_by(Registration.id.desc())
        .limit(1)
    )
    if event_id is not None:
        stmt = stmt.where(Registration.event_id == event_id)
    else:
        stmt = stmt.where(Event.status != EventStatus.event_completed)
    result = await db.execute(stmt)
    reg = result.scalar_one_or_none()
    return await _registration_out(db, reg) if reg is not None else None


@router.get("/me", response_model=RegistrationOut | None)
async def get_my_registration(
    event_id: int, db: DbSession, user: CurrentUser
) -> RegistrationOut | None:
    """Read a registration without creating a draft as a side effect."""
    employee = await _current_employee(db, user)
    await master_data.get_or_404(db, Event, event_id)
    result = await db.execute(
        select(Registration).where(
            Registration.event_id == event_id, Registration.employee_id == employee.id
        )
    )
    reg = result.scalar_one_or_none()
    return await _registration_out(db, reg) if reg is not None else None


@router.post("/me/draft", response_model=RegistrationOut, status_code=status.HTTP_201_CREATED)
async def create_my_registration_draft(
    event_id: int, db: DbSession, user: CurrentUser
) -> RegistrationOut:
    """Create a draft only after the employee explicitly starts the form."""
    employee = await _current_employee(db, user)
    event = await master_data.get_or_404(db, Event, event_id)
    # Do the state check before get_or_create so closed events stay untouched.
    assert_can_edit(event, Registration(status="draft"))
    reg = await get_or_create_registration(db, event_id, employee.id)
    await db.commit()
    return await _registration_out(db, reg)


@router.put("/me", response_model=RegistrationOut)
async def update_my_registration(
    event_id: int, payload: RegistrationUpdate, db: DbSession, user: CurrentUser
) -> RegistrationOut:
    employee = await _current_employee(db, user)
    event = await master_data.get_or_404(db, Event, event_id)
    # Avoid materialising drafts for requests that are rejected because the
    # event is closed; an explicit draft is only created by POST /me/draft.
    assert_can_edit(event, Registration(status="draft"))
    reg = await get_or_create_registration(db, event_id, employee.id)
    assert_can_edit(event, reg)

    data = payload.model_dump(exclude={"transport_needs"}, exclude_unset=True)
    if data.get("shift_id") is not None:
        shift = await db.get(Shift, data["shift_id"])
        if shift is None or shift.event_id != event_id:
            raise AppError("invalid_shift", "Ca không thuộc sự kiện này", status.HTTP_400_BAD_REQUEST)
    for key, value in data.items():
        setattr(reg, key, value)
    if reg.status == "submitted" and reg.is_participating is False:
        await _remove_operational_assignments(db, event_id, employee.id)

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
        legs_by_id = {
            leg.id: leg
            for leg in (
                await db.execute(select(TransportLeg).where(TransportLeg.id.in_(leg_ids)))
            ).scalars().all()
        } if leg_ids else {}
        pickups_by_id: dict[int, PickupPoint] = {}
        if pickup_ids:
            result = await db.execute(
                select(PickupPoint).where(
                    PickupPoint.event_id == event_id, PickupPoint.id.in_(pickup_ids)
                )
            )
            pickups_by_id = {point.id: point for point in result.scalars().all()}
            if set(pickups_by_id) != pickup_ids:
                raise AppError(
                    "invalid_pickup_point", "Điểm đón không thuộc sự kiện này",
                    status.HTTP_400_BAD_REQUEST,
                )
        for need in payload.transport_needs:
            if not need.is_needed or need.pickup_point_id is None:
                continue
            leg = legs_by_id.get(need.leg_id)
            point = pickups_by_id[need.pickup_point_id]
            going = leg is not None and leg.direction == "outbound"
            if going:
                if point.kind != "workplace":
                    raise AppError(
                        "pickup_kind_mismatch",
                        "Chiều đi chỉ được chọn điểm đón nơi làm việc",
                        status.HTTP_400_BAD_REQUEST,
                    )
                if employee.site_id is not None and point.site_id != employee.site_id:
                    raise AppError(
                        "pickup_site_mismatch",
                        "Điểm đón không phục vụ địa điểm làm việc của bạn",
                        status.HTTP_400_BAD_REQUEST,
                    )
            elif point.kind != "venue":
                raise AppError(
                    "pickup_kind_mismatch",
                    "Chiều về chỉ được chọn điểm đón tại khách sạn hoặc sân chơi",
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
    assert_can_edit(event, Registration(status="draft"))
    reg = await get_or_create_registration(db, event_id, employee.id)
    assert_can_edit(event, reg)

    # the version recorded as agreed is the event's own current one, never the
    # client's copy of it — otherwise the consent record (which is the whole
    # point of agreed_terms_at/terms_version) is whatever the browser posted
    current_terms_version = await get_setting(
        db, event_id, "terms_version", DEFAULT_TERMS_VERSION
    )
    submit_registration(
        reg,
        is_participating=payload.is_participating,
        agreed_terms=payload.agreed_terms,
        terms_version=str(current_terms_version),
    )
    if not reg.is_participating:
        await _remove_operational_assignments(db, event_id, employee.id)
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

    # dedupe key is per-registration *content*, not just per-registration id:
    # keying on reg.id alone (the previous behavior) meant editing and
    # resubmitting with a different Ca or transport needs before the deadline
    # never sent an updated confirmation — CBNV kept the first email forever,
    # even if it no longer matched what they'd actually submitted
    content_fingerprint = hashlib.sha1(
        f"{reg.is_participating}:{reg.shift_id}:{sorted(n.leg_id for n in needs if n.is_needed)}".encode()
    ).hexdigest()[:10]
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
        dedupe_key=f"registration_confirmed:{reg.id}:{content_fingerprint}",
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
    result = await db.execute(
        select(Registration).where(
            Registration.event_id == event_id, Registration.employee_id == employee.id
        )
    )
    reg = result.scalar_one_or_none()
    if reg is None:
        raise AppError("not_found", "Chưa có đăng ký để huỷ", status.HTTP_404_NOT_FOUND)
    assert_can_edit(event, reg)
    cancel_registration(reg, payload.reason)
    # A cancelled attendee must stop consuming operational capacity right
    # away. In particular, manual (locked) assignments are not eligible for a
    # later allocation run to clean up on its own.
    await _remove_operational_assignments(db, event_id, employee.id)
    await record_audit(
        db, actor_user_id=user.id, action="cancel", entity_type="registration", entity_id=reg.id,
        reason=payload.reason, event_id=event_id,
        after={"operational_assignments_removed": True},
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
        stmt = stmt.where(
            Employee.full_name.ilike(needle)
            | Employee.email.ilike(needle)
            | Employee.employee_code.ilike(needle)
        )
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
                team_code=reg.employee.team.code if reg.employee.team else None,
                position=reg.employee.position,
                shift_name=shifts.get(reg.shift_id) if reg.shift_id else None,
                transport_summary=", ".join(needs_by_reg.get(reg.id, [])) or None,
            )
        )
    return out


@router.post("/remind", status_code=status.HTTP_202_ACCEPTED)
async def remind_unsubmitted(
    event_id: int,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> dict:
    """Nhắc mọi CBNV chưa trả lời đăng ký (kể cả người chưa từng mở form).
    Gửi qua worker, mỗi người tối đa một email/ngày."""
    event = await master_data.get_or_404(db, Event, event_id)
    # Guard added with the widened target set: without it BTC could mail
    # "nhớ đăng ký nhé" to everyone who never registered for an event that
    # already closed (or finished) — 15 people on the demo's completed event.
    if not is_accepting_registration(event):
        raise AppError(
            "registration_not_open",
            "Chỉ nhắc được khi sự kiện đang trong thời gian mở đăng ký",
            status.HTTP_400_BAD_REQUEST,
        )
    targets = await remindable_employees(db, event_id)
    if not targets:
        raise AppError(
            "nothing_to_remind",
            "Không còn ai cần nhắc hôm nay (mọi người đã trả lời hoặc đã được nhắc)",
            status.HTTP_400_BAD_REQUEST,
        )
    await record_audit(
        db,
        actor_user_id=user.id,
        action="remind",
        entity_type="registration",
        entity_id=event_id,
        after={"count": len(targets)},
        event_id=event_id,
    )
    await db.commit()
    await queue.enqueue_job("remind_unsubmitted_task", event_id)
    return {"queued": len(targets)}


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
    # the list endpoint resolves both of these; the export used to dump the raw
    # enum value and the raw shift *id* into a Vietnamese spreadsheet
    shifts = {s.id: s.name for s in await master_data.list_all(db, Shift, event_id=event_id)}

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
            REGISTRATION_STATUS_LABELS.get(reg.status, reg.status),
            "Có" if reg.is_participating else ("Không" if reg.is_participating is False else ""),
            shifts.get(reg.shift_id, "") if reg.shift_id else "",
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
