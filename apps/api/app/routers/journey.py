from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.models.enums import UserRole
from app.models.event import Event
from app.models.organization import Employee
from app.schemas.journey import JourneyOut
from app.services.journey_service import build_journey, resolve_published_event

router = APIRouter(prefix="/journey", tags=["journey"])


@router.get("/me", response_model=JourneyOut)
async def get_my_journey(
    db: DbSession,
    user: CurrentUser,
    event_id: int | None = None,
    employee_id: int | None = None,
) -> JourneyOut:
    is_admin = user.role in (UserRole.organizer, UserRole.super_admin)

    if is_admin and event_id is not None and employee_id is not None:
        # admin preview: any event status, any employee
        event = await db.get(Event, event_id)
        employee = await db.get(Employee, employee_id)
        if event is None or employee is None:
            raise AppError("not_found", "Event hoặc Employee không tồn tại", status.HTTP_404_NOT_FOUND)
        return await build_journey(db, event, employee)

    if user.employee_id is None:
        raise AppError(
            "no_employee_record", "Tài khoản này không gắn với hồ sơ nhân viên",
            status.HTTP_400_BAD_REQUEST,
        )
    employee = await db.get(Employee, user.employee_id)
    event = await resolve_published_event(db, user.employee_id)
    return await build_journey(db, event, employee)
