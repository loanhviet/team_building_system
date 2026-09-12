import logging

from fastapi import status

from app.core.errors import AppError

logger = logging.getLogger("app")

CHAT_RATE_LIMIT = 20
CHAT_RATE_WINDOW_SECONDS = 60


async def check_chat_rate(redis, user_id: int) -> None:
    """Sliding-window-ish cap via Redis INCR+EXPIRE. Fails open if Redis is down
    so a cache blip doesn't take out the whole assistant."""
    try:
        key = f"chat_rl:{user_id}"
        n = await redis.incr(key)
        if n == 1:
            await redis.expire(key, CHAT_RATE_WINDOW_SECONDS)
        if n > CHAT_RATE_LIMIT:
            raise AppError(
                "rate_limited",
                "Bạn hỏi hơi nhanh, vui lòng đợi một phút rồi thử lại.",
                status.HTTP_429_TOO_MANY_REQUESTS,
            )
    except AppError:
        raise
    except Exception:
        logger.warning("chat rate limit unavailable", exc_info=True)
