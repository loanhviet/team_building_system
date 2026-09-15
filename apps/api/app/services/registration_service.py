from fastapi import status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.time import utcnow
from app.models.event import Event
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
