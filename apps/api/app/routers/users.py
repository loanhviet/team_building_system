from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import or_, select

from app.core.deps import DbSession, require_super_admin
from app.core.errors import AppError
from app.models.auth import User
from app.models.enums import UserRole
from app.models.organization import Employee
from app.schemas.auth import ResetPasswordOut, UserAdminOut, UserAdminUpdate
from app.services.audit_service import record_audit
from app.services.auth_service import revoke_all_refresh_tokens
from app.services.user_admin_service import apply_user_update, reset_user_password

router = APIRouter(prefix="/users", tags=["users"])

SuperAdmin = Annotated[User, Depends(require_super_admin)]


def _user_admin_out(user: User) -> UserAdminOut:
    emp = user.employee
    return UserAdminOut(
        id=user.id,
        email=user.email,
        role=user.role.value,
        is_active=user.is_active,
        must_change_password=user.must_change_password,
        employee_id=user.employee_id,
        full_name=emp.full_name if emp else None,
        employee_code=emp.employee_code if emp else None,
        last_login_at=user.last_login_at,
    )


@router.get("", response_model=list[UserAdminOut])
async def list_users(
    db: DbSession,
    _user: SuperAdmin,
    search: str | None = None,
    role: str | None = None,
) -> list[UserAdminOut]:
    stmt = select(User).outerjoin(Employee, Employee.id == User.employee_id).order_by(User.id)
    if search:
        needle = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                User.email.ilike(needle),
                Employee.full_name.ilike(needle),
                Employee.employee_code.ilike(needle),
            )
        )
    if role:
        try:
            stmt = stmt.where(User.role == UserRole(role))
        except ValueError as exc:
            raise AppError("invalid_role", "Vai trò không hợp lệ", status.HTTP_400_BAD_REQUEST) from exc
    result = await db.execute(stmt)
    return [_user_admin_out(u) for u in result.scalars().unique().all()]


@router.patch("/{user_id}", response_model=UserAdminOut)
async def update_user(
    user_id: int, payload: UserAdminUpdate, db: DbSession, actor: SuperAdmin
) -> UserAdminOut:
    target = await db.get(User, user_id)
    if target is None:
        raise AppError("not_found", "User not found", status.HTTP_404_NOT_FOUND)
    before = {"role": target.role.value, "is_active": target.is_active}
    apply_user_update(actor, target, role=payload.role, is_active=payload.is_active)
    await record_audit(
        db,
        actor_user_id=actor.id,
        action="update",
        entity_type="user",
        entity_id=target.id,
        before=before,
        after={"role": target.role.value, "is_active": target.is_active},
    )
    await db.commit()
    await db.refresh(target)
    return _user_admin_out(target)


@router.post("/{user_id}/reset-password", response_model=ResetPasswordOut)
async def reset_password(user_id: int, db: DbSession, actor: SuperAdmin) -> ResetPasswordOut:
    target = await db.get(User, user_id)
    if target is None:
        raise AppError("not_found", "User not found", status.HTTP_404_NOT_FOUND)
    temporary = reset_user_password(target)
    await revoke_all_refresh_tokens(db, target.id)
    await record_audit(
        db,
        actor_user_id=actor.id,
        action="reset_password",
        entity_type="user",
        entity_id=target.id,
    )
    await db.commit()
    return ResetPasswordOut(temporary_password=temporary)
