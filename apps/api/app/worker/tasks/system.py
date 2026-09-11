import logging

logger = logging.getLogger("worker")


async def ping(ctx: dict) -> str:
    logger.info("ping task executed")
    return "pong"
