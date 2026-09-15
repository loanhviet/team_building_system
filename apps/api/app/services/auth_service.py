from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)
from app.core.time import utcnow
from app.models.auth import RefreshToken, User


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise AppError("invalid_credentials", "Email hoặc mật khẩu không đúng", status.HTTP_401_UNAUTHORIZED)
    return user


async def issue_tokens(
    db: AsyncSession, user: User, user_agent: str | None
) -> tuple[str, str]:
    access_token = create_access_token(user.id, user.role.value)
    refresh_plain = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_plain),
            expires_at=refresh_token_expiry(),
            user_agent=user_agent,
        )
    )
    user.last_login_at = utcnow()
    return access_token, refresh_plain


async def rotate_refresh_token(
    db: AsyncSession, refresh_plain: str, user_agent: str | None
) -> tuple[str, str, User]:
    token_hash = hash_refresh_token(refresh_plain)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    token_row = result.scalar_one_or_none()

    if token_row is None or token_row.revoked_at is not None:
        raise AppError("invalid_refresh_token", "Refresh token không hợp lệ", status.HTTP_401_UNAUTHORIZED)
    if token_row.expires_at < utcnow():
        raise AppError("refresh_token_expired", "Refresh token đã hết hạn", status.HTTP_401_UNAUTHORIZED)

    user = await db.get(User, token_row.user_id)
    if user is None or not user.is_active:
        raise AppError("unauthorized", "User not found or inactive", status.HTTP_401_UNAUTHORIZED)

    token_row.revoked_at = utcnow()
    access_token, new_refresh_plain = await issue_tokens(db, user, user_agent)
    return access_token, new_refresh_plain, user


async def revoke_refresh_token(db: AsyncSession, refresh_plain: str) -> None:
    token_hash = hash_refresh_token(refresh_plain)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    token_row = result.scalar_one_or_none()
    if token_row is not None and token_row.revoked_at is None:
        token_row.revoked_at = utcnow()


async def revoke_all_refresh_tokens(db: AsyncSession, user_id: int) -> None:
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    )
    now = utcnow()
    for token in result.scalars().all():
        token.revoked_at = now
