import logging
from typing import ClassVar

from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.worker.tasks.system import ping

settings = get_settings()

setup_logging()
logger = logging.getLogger("worker")


async def startup(ctx: dict) -> None:
    logger.info("worker startup: connected to redis")


async def shutdown(ctx: dict) -> None:
    logger.info("worker shutdown")


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions: ClassVar[list] = [ping]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = "arq:default"
