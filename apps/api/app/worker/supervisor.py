"""Restart ARQ when it stops making progress after a Redis disconnect.

Docker restarts a process that exits, but a stuck ARQ process remains "Up".
The supervisor runs outside ARQ, watches an independent Redis connection and
terminates the child if its cron heartbeat goes stale. Queued jobs stay in
Redis and are picked up after the restart.
"""

import asyncio
import signal
import time

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings

HEARTBEAT_KEY = "worker:heartbeat"
GRACE_SECONDS = 35
STALE_SECONDS = 20


async def supervise() -> int:
    settings = get_settings()
    child = await asyncio.create_subprocess_exec("arq", "app.worker.settings.WorkerSettings")
    started_at = time.monotonic()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        while child.poll() is None:
            await asyncio.sleep(5)
            try:
                raw = await redis.get(HEARTBEAT_KEY)
                heartbeat = float(raw) if raw else 0.0
            except (RedisError, ValueError, OSError):
                heartbeat = 0.0
            if time.monotonic() - started_at < GRACE_SECONDS:
                continue
            if time.time() - heartbeat > STALE_SECONDS:
                child.terminate()
                try:
                    await asyncio.wait_for(child.wait(), timeout=10)
                except TimeoutError:
                    child.kill()
                    await child.wait()
                return 1
        return child.returncode or 0
    finally:
        await redis.aclose()


def _forward_signal(signum: int, _frame: object) -> None:
    # Keep the container's normal stop behaviour: let the supervisor exit and
    # Docker avoid treating an intentional stop as a crash loop.
    raise KeyboardInterrupt


def main() -> None:
    signal.signal(signal.SIGTERM, _forward_signal)
    try:
        raise SystemExit(asyncio.run(supervise()))
    except KeyboardInterrupt:
        raise SystemExit(0) from None


if __name__ == "__main__":
    main()
