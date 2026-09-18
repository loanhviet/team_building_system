from collections.abc import Callable, Coroutine
from typing import Annotated

import jwt
from fastapi import Depends, Header, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.auth import User
from app.models.enums import UserRole

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError("unauthorized", "Missing access token", status.HTTP_401_UNAUTHORIZED)

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise AppError("token_expired", "Access token expired", status.HTTP_401_UNAUTHORIZED) from None
    except jwt.InvalidTokenError:
        raise AppError("invalid_token", "Invalid access token", status.HTTP_401_UNAUTHORIZED) from None

    user_id = int(payload["sub"])
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError("unauthorized", "User not found or inactive", status.HTTP_401_UNAUTHORIZED)
    # A temporary password is only for getting into the password-change screen.
    # Keep this guard at the authentication boundary so a newly added protected
    # endpoint cannot accidentally bypass the policy.
    if user.must_change_password and request.url.path not in {
        "/api/auth/me",
        "/api/auth/change-password",
    }:
        raise AppError(
            "password_change_required",
            "Bạn cần đổi mật khẩu trước khi sử dụng các chức năng khác",
            status.HTTP_403_FORBIDDEN,
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole) -> Callable[[User], Coroutine[None, None, User]]:
    async def dependency(user: CurrentUser) -> User:
        if user.role not in roles:
            raise AppError(
                "forbidden", "You do not have permission for this action", status.HTTP_403_FORBIDDEN
            )
        return user

    return dependency


require_admin = require_roles(UserRole.organizer, UserRole.super_admin)
require_super_admin = require_roles(UserRole.super_admin)
