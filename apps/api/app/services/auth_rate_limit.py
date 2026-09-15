import logging

from fastapi import status

from app.core.errors import AppError

logger = logging.getLogger("app")

LOGIN_RATE_LIMIT = 10
LOGIN_RATE_WINDOW_SECONDS = 60


async def check_login_rate(redis, identity: str) -> None:
    try:
        key = f"login_rl:{identity.strip().lower()}"
        attempts = await redis.incr(key)
        if attempts == 1:
            await redis.expire(key, LOGIN_RATE_WINDOW_SECONDS)
        if attempts > LOGIN_RATE_LIMIT:
            raise AppError(
                "login_rate_limited",
                "Đăng nhập quá nhiều lần. Vui lòng đợi một phút rồi thử lại.",
                status.HTTP_429_TOO_MANY_REQUESTS,
            )
    except AppError:
        raise
    except Exception:
        logger.warning("login rate limit unavailable", exc_info=True)
