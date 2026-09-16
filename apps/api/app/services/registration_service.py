from fastapi import status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.time import utcnow
from app.models.event import Event
from app.models.notification import EmailOutbox
from app.models.organization import Employee
from app.models.registration import Registration, RegistrationTransportNeed


async def get_or_create_registration(db: AsyncSession, event_id: int, employee_id: int) -> Registration:
    result = await db.execute(
        select(Registration).where(
            Registration.event_id == event_id, Registration.employee_id == employee_id
        )
    )
    reg = result.scalar_one_or_none()
    if reg is None:
        reg = Registration(event_id=event_id, employee_id=employee_id, status="draft")
        db.add(reg)
        await db.flush()
    return reg


def assert_can_edit(event: Event, reg: Registration) -> None:
    if event.status != "registration_open":
        raise AppError(
            "registration_closed", "Sự kiện hiện không mở đăng ký", status.HTTP_400_BAD_REQUEST
        )
    if event.registration_open_at and utcnow() < event.registration_open_at:
        raise AppError(
            "registration_not_open", "Chưa đến thời gian mở đăng ký", status.HTTP_400_BAD_REQUEST
        )
    if event.registration_close_at and utcnow() > event.registration_close_at:
        raise AppError(
            "registration_closed", "Đã quá hạn chỉnh sửa đăng ký", status.HTTP_400_BAD_REQUEST
        )
    if reg.status == "cancelled":
        raise AppError(
            "registration_cancelled", "Đăng ký đã bị huỷ, vui lòng liên hệ BTC", status.HTTP_400_BAD_REQUEST
        )


async def replace_transport_needs(
    db: AsyncSession, registration_id: int, needs: list[dict]
) -> None:
    await db.execute(
        delete(RegistrationTransportNeed).where(
            RegistrationTransportNeed.registration_id == registration_id
        )
    )
    for need in needs:
        db.add(
            RegistrationTransportNeed(
                registration_id=registration_id,
                leg_id=need["leg_id"],
                is_needed=need.get("is_needed", False),
                pickup_point_id=need.get("pickup_point_id"),
            )
        )
    await db.flush()


def submit_registration(
    reg: Registration, *, is_participating: bool, agreed_terms: bool, terms_version: str
) -> None:
    if is_participating and not agreed_terms:
        raise AppError(
            "terms_not_agreed",
            "Bạn phải đọc và đồng ý quy định chương trình trước khi Submit",
            status.HTTP_400_BAD_REQUEST,
        )
    reg.is_participating = is_participating
    if is_participating:
        reg.agreed_terms_at = utcnow()
        reg.terms_version = terms_version
    reg.status = "submitted"
    reg.submitted_at = utcnow()


def cancel_registration(reg: Registration, reason: str | None) -> None:
    reg.status = "cancelled"
    reg.cancelled_at = utcnow()
    reg.cancel_reason = reason


async def unsubmitted_employees(db: AsyncSession, event_id: int) -> list[Employee]:
    """Active CBNV who still owe an answer on this event's registration.

    Deliberately *not* "registrations with status=draft": a draft row only
    exists once someone has opened the form, so keying the reminder on drafts
    skipped everyone who never visited at all — which is precisely the group
    that needs the nudge (118 of 120 on a freshly opened event).

    `cancelled` is excluded: opting out is a deliberate answer, not a missing
    one. Single source of truth for the reminder count (dashboard), the
    endpoint's guard, and the worker's fan-out, so the number BTC confirms is
    the number that actually gets mailed.
    """
    answered = select(Registration.employee_id).where(
        Registration.event_id == event_id,
        Registration.status.in_(["submitted", "cancelled"]),
    )
    result = await db.execute(
        select(Employee)
        .where(Employee.is_active.is_(True), Employee.id.not_in(answered))
        .order_by(Employee.id)
    )
    return list(result.scalars().all())


def reminder_dedupe_key(event_id: int, employee_id: int, day: str) -> str:
    """One reminder per employee per UTC day. Shared with the worker so the
    "already nudged today" filter below and the outbox rows it inspects can
    never drift apart."""
    return f"registration_reminder:{event_id}:{employee_id}:{day}"


async def remindable_employees(db: AsyncSession, event_id: int) -> list[Employee]:
    """`unsubmitted_employees` minus anyone already nudged today.

    The endpoint reports this count and the confirm dialog shows it, so BTC
    isn't told "119 emails queued" on a second click that the worker's dedupe
    then silently drops to zero — and the button falls to (0) and disables
    itself once today's round has gone out.
    """
    employees = await unsubmitted_employees(db, event_id)
    if not employees:
        return []
    day = utcnow().date().isoformat()
    key_to_employee = {
        reminder_dedupe_key(event_id, employee.id, day): employee.id for employee in employees
    }
    sent = await db.execute(
        select(EmailOutbox.dedupe_key).where(EmailOutbox.dedupe_key.in_(list(key_to_employee)))
    )
    already = {key_to_employee[key] for (key,) in sent.all()}
    return [employee for employee in employees if employee.id not in already]
