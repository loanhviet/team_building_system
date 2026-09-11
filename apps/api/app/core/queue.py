from arq import ArqRedis
from arq.connections import RedisSettings, create_pool
from fastapi import Request

from app.core.config import get_settings

settings = get_settings()


async def init_arq_pool() -> ArqRedis:
    return await create_pool(RedisSettings.from_dsn(settings.redis_url))


async def get_queue(request: Request) -> ArqRedis:
    return request.app.state.arq_pool
