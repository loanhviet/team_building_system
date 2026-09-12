import logging
from typing import ClassVar

from arq import cron
from arq.connections import RedisSettings
from arq.worker import func as arq_func

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.worker.tasks.allocation import run_flight_allocation_task
from app.worker.tasks.bus_allocation import run_bus_allocation_task
from app.worker.tasks.email import send_email
from app.worker.tasks.gala import expire_gala_holds_task
from app.worker.tasks.imports import import_employees_task
from app.worker.tasks.notifications import send_bulk_emails_task
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
    functions: ClassVar[list] = [
        ping,
        import_employees_task,
        run_flight_allocation_task,
        run_bus_allocation_task,
        send_bulk_emails_task,
        arq_func(send_email, max_tries=3),
    ]
    cron_jobs: ClassVar[list] = [
        cron(expire_gala_holds_task, second=set(range(0, 60, 5))),
    ]
    on_startup = startup
    on_shutdown = shutdown
