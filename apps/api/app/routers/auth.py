from typing import Annotated

from fastapi import APIRouter, Cookie, Header, Response, status

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.core.security import hash_password, verify_password
from app.models.auth import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, LoginResponse, UserOut
from app.services.auth_service import (
    authenticate_user,
    issue_tokens,
    revoke_refresh_token,
    rotate_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])

settings = get_settings()
REFRESH_COOKIE = "refresh_token"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=settings.refresh_token_days * 86400,
        httponly=True,
        secure=settings.app_env != "dev",
        samesite="lax",
        path="/api/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth")


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        role=user.role.value,
        must_change_password=user.must_change_password,
        employee_id=user.employee_id,
        full_name=user.employee.full_name if user.employee else None,
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: DbSession,
    user_agent: str | None = Header(default=None),
) -> LoginResponse:
    user = await authenticate_user(db, payload.email, payload.password)
    access_token, refresh_token = await issue_tokens(db, user, user_agent)
    await db.commit()
    _set_refresh_cookie(response, refresh_token)
    return LoginResponse(access_token=access_token, user=_user_out(user))


@router.post("/refresh", response_model=LoginResponse)
async def refresh(
    response: Response,
    db: DbSession,
    user_agent: str | None = Header(default=None),
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> LoginResponse:
    if refresh_token is None:
        raise AppError("missing_refresh_token", "Missing refresh token", status.HTTP_401_UNAUTHORIZED)
    access_token, new_refresh, user = await rotate_refresh_token(db, refresh_token, user_agent)
    await db.commit()
    _set_refresh_cookie(response, new_refresh)
    return LoginResponse(access_token=access_token, user=_user_out(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: DbSession,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> None:
    if refresh_token:
        await revoke_refresh_token(db, refresh_token)
        await db.commit()
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return _user_out(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest, user: CurrentUser, db: DbSession
) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise AppError(
            "invalid_current_password", "Mật khẩu hiện tại không đúng", status.HTTP_400_BAD_REQUEST
        )
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    await db.commit()
