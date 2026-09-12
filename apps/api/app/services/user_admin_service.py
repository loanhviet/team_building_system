from fastapi import status

from app.core.errors import AppError
from app.core.security import hash_password
from app.models.auth import User
from app.models.enums import UserRole


def apply_user_update(actor: User, target: User, *, role: str | None, is_active: bool | None) -> None:
    if target.id == actor.id and is_active is False:
        raise AppError("cannot_deactivate_self", "Không thể tự khoá tài khoản của mình", status.HTTP_400_BAD_REQUEST)
    if target.id == actor.id and role is not None and role != target.role.value:
        raise AppError("cannot_change_own_role", "Không thể tự đổi vai trò của mình", status.HTTP_400_BAD_REQUEST)

    if role is not None:
        try:
            target.role = UserRole(role)
        except ValueError as exc:
            raise AppError("invalid_role", "Vai trò không hợp lệ", status.HTTP_400_BAD_REQUEST) from exc
    if is_active is not None:
        target.is_active = is_active


def reset_user_password(target: User) -> str:
    code = target.employee.employee_code if target.employee and target.employee.employee_code else None
    temporary = code or "ChangeMe1"
    target.password_hash = hash_password(temporary)
    target.must_change_password = True
    return temporary
