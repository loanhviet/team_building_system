import pytest

from app.core.errors import AppError
from app.models.auth import User
from app.models.enums import UserRole
from app.models.organization import Employee
from app.services.team_roster_service import resolve_roster_team_id


def _user(role: UserRole, team_id: int | None = 3) -> User:
    user = User(email="a@example.com", password_hash="x", role=role)
    if team_id is not None:
        user.employee = Employee(
            full_name="An", email="a@example.com", team_id=team_id
        )
    return user


def test_employee_cannot_view_roster():
    with pytest.raises(AppError) as exc:
        resolve_roster_team_id(_user(UserRole.employee), None)
    assert exc.value.status_code == 403


def test_team_leader_uses_own_team():
    assert resolve_roster_team_id(_user(UserRole.team_leader, 7), None) == 7


def test_team_leader_cannot_peek_other_team():
    with pytest.raises(AppError) as exc:
        resolve_roster_team_id(_user(UserRole.team_leader, 7), 99)
    assert exc.value.status_code == 403


def test_admin_requires_team_id():
    admin = User(email="btc@example.com", password_hash="x", role=UserRole.organizer)
    with pytest.raises(AppError) as exc:
        resolve_roster_team_id(admin, None)
    assert exc.value.code == "team_required"


def test_admin_can_pass_any_team_id():
    admin = User(email="btc@example.com", password_hash="x", role=UserRole.super_admin)
    assert resolve_roster_team_id(admin, 12) == 12
