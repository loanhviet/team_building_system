import logging
import time

logger = logging.getLogger("worker")


async def ping(ctx: dict) -> str:
    logger.info("ping task executed")
    return "pong"


async def worker_heartbeat_task(ctx: dict) -> None:
    """Update a liveness key observed by the process supervisor.

    A TCP-open Redis connection is not enough: ARQ can remain alive after a
    broken connection while it no longer consumes jobs or runs cron work. This
    task proves that the worker event loop is actually making progress.
    """
    await ctx["redis"].set("worker:heartbeat", str(time.time()), ex=30)
