import logging
from typing import ClassVar

from arq import cron
from arq.connections import RedisSettings
from arq.worker import func as arq_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.session import AsyncSessionLocal
from app.models.rag import KnowledgeDocument, RagChunk
from app.worker.tasks.allocation import run_flight_allocation_task
from app.worker.tasks.bus_allocation import run_bus_allocation_task
from app.worker.tasks.email import send_email
from app.worker.tasks.gala import expire_gala_holds_task
from app.worker.tasks.imports import import_employees_task
from app.worker.tasks.notifications import remind_unsubmitted_task, send_bulk_emails_task
from app.worker.tasks.rag import reindex_rag_task
from app.worker.tasks.system import ping, worker_heartbeat_task

settings = get_settings()

setup_logging()
logger = logging.getLogger("worker")


class QuietRoutineCronFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno >= logging.WARNING:
            return True
        message = record.getMessage()
        return not any(name in message for name in (
            "cron:worker_heartbeat_task", "cron:expire_gala_holds_task",
        ))


async def startup(ctx: dict) -> None:
    # ARQ's CLI adds its own handler after setup_logging(), so propagation
    # duplicates every line in the root JSON logger.
    logging.getLogger("arq").propagate = False
    logging.getLogger("arq.worker").addFilter(QuietRoutineCronFilter())
    logger.info("worker startup: connected to redis")
    # A full seed inserts published FAQ directly, bypassing the admin route
    # that normally schedules indexing. Also repair older seeded databases
    # whose FAQ exists but whose RAG chunks were never built.
    async with AsyncSessionLocal() as db:
        await enqueue_missing_rag_indexes(db, ctx["redis"])


async def enqueue_missing_rag_indexes(db: AsyncSession, redis) -> None:
    event_ids = (await db.execute(
        select(KnowledgeDocument.event_id)
        .where(KnowledgeDocument.is_published.is_(True)).distinct()
    )).scalars().all()
    for event_id in event_ids:
        indexed = await db.scalar(
            select(RagChunk.id).where(RagChunk.event_id == event_id).limit(1)
        )
        if indexed is None:
            await redis.enqueue_job("reindex_rag_task", event_id)
            logger.info("queued missing RAG index for event %s", event_id)


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
        remind_unsubmitted_task,
        reindex_rag_task,
        arq_func(send_email, max_tries=3),
    ]
    cron_jobs: ClassVar[list] = [
        cron(worker_heartbeat_task, second=set(range(0, 60, 5))),
        cron(expire_gala_holds_task, second=set(range(0, 60, 5))),
    ]
    on_startup = startup
    on_shutdown = shutdown
