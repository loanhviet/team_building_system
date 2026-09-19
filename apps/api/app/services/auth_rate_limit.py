import logging
from hashlib import sha256

from fastapi import status

from app.core.errors import AppError

logger = logging.getLogger("app")

LOGIN_RATE_LIMIT = 10
LOGIN_RATE_WINDOW_SECONDS = 60


async def check_login_rate(redis, identity: str, client_ip: str | None) -> None:
    try:
        # A stranger must not be able to lock another person's account from a
        # different address. Hash the pair to avoid storing email in Redis keys.
        pair = f"{client_ip or 'unknown'}:{identity.strip().lower()}"
        key = f"login_rl:{sha256(pair.encode()).hexdigest()}"
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
