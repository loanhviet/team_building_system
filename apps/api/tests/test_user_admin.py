import pytest

from app.core.errors import AppError
from app.models.auth import User
from app.models.enums import UserRole
from app.services.user_admin_service import apply_user_update


def test_cannot_deactivate_self():
    actor = User(id=1, email="a@x.vn", password_hash="x", role=UserRole.super_admin)
    with pytest.raises(AppError) as exc:
        apply_user_update(actor, actor, role=None, is_active=False)
    assert exc.value.code == "cannot_deactivate_self"


def test_cannot_change_own_role():
    actor = User(id=1, email="a@x.vn", password_hash="x", role=UserRole.super_admin)
    with pytest.raises(AppError) as exc:
        apply_user_update(actor, actor, role="organizer", is_active=None)
    assert exc.value.code == "cannot_change_own_role"


def test_admin_can_change_other_role_and_deactivate():
    actor = User(id=1, email="a@x.vn", password_hash="x", role=UserRole.super_admin)
    target = User(id=2, email="b@x.vn", password_hash="x", role=UserRole.employee, is_active=True)
    apply_user_update(actor, target, role="team_leader", is_active=False)
    assert target.role == UserRole.team_leader
    assert target.is_active is False
