from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.auth import User
from app.models.enums import UserRole
from app.models.event import Event, Shift
from app.models.organization import Employee, Team
from app.models.registration import Registration
from app.schemas.organization import TeamRosterMember, TeamRosterOut


def resolve_roster_team_id(user: User, team_id: int | None) -> int:
    if user.role in (UserRole.organizer, UserRole.super_admin):
        if team_id is None:
            raise AppError(
                "team_required",
                "Admin cần truyền team_id",
                status.HTTP_400_BAD_REQUEST,
            )
        return team_id

    if user.role != UserRole.team_leader:
        raise AppError(
            "forbidden",
            "Chỉ Trưởng nhóm hoặc BTC được xem danh sách Team",
            status.HTTP_403_FORBIDDEN,
        )
    if user.employee is None or user.employee.team_id is None:
        raise AppError(
            "no_team",
            "Tài khoản chưa gắn với Team nào",
            status.HTTP_400_BAD_REQUEST,
        )
    if team_id is not None and team_id != user.employee.team_id:
        raise AppError(
            "forbidden",
            "Bạn chỉ xem được Team của mình",
            status.HTTP_403_FORBIDDEN,
        )
    return user.employee.team_id


async def build_team_roster(
    db: AsyncSession, event_id: int, team_id: int
) -> TeamRosterOut:
    event = await db.get(Event, event_id)
    if event is None:
        raise AppError("not_found", "Event không tồn tại", status.HTTP_404_NOT_FOUND)
    team = await db.get(Team, team_id)
    if team is None or not team.is_active:
        raise AppError("not_found", "Team không tồn tại", status.HTTP_404_NOT_FOUND)

    result = await db.execute(
        select(Employee)
        .where(Employee.team_id == team_id, Employee.is_active.is_(True))
        .order_by(Employee.full_name)
    )
    employees = result.scalars().all()

    result = await db.execute(
        select(Registration, Shift)
        .outerjoin(Shift, Shift.id == Registration.shift_id)
        .where(Registration.event_id == event_id)
    )
    reg_by_employee: dict[int, tuple[Registration, Shift | None]] = {}
    for reg, shift in result.all():
        reg_by_employee[reg.employee_id] = (reg, shift)

    members: list[TeamRosterMember] = []
    for emp in employees:
        pair = reg_by_employee.get(emp.id)
        reg = pair[0] if pair else None
        shift = pair[1] if pair else None
        members.append(
            TeamRosterMember(
                employee_id=emp.id,
                employee_code=emp.employee_code,
                full_name=emp.full_name,
                email=emp.email,
                phone=emp.phone,
                registration_status=reg.status if reg else None,
                is_participating=reg.is_participating if reg else None,
                shift_name=shift.name if shift else None,
            )
        )

    return TeamRosterOut(
        event_id=event_id, team_id=team.id, team_name=team.name, members=members
    )
