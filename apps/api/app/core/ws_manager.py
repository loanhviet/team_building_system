import asyncio
import json
import logging

from fastapi import WebSocket
from redis.asyncio import Redis

logger = logging.getLogger("app")


class GalaConnectionManager:
    """Tracks local WebSocket connections per event and bridges them to a Redis
    pub/sub channel, so state changes broadcast correctly regardless of which
    API process (or the worker) produced them."""

    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}
        self._pubsub_task: asyncio.Task | None = None

    async def connect(self, event_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(event_id, set()).add(ws)

    def disconnect(self, event_id: int, ws: WebSocket) -> None:
        conns = self._connections.get(event_id)
        if conns:
            conns.discard(ws)
            if not conns:
                self._connections.pop(event_id, None)

    async def broadcast_local(self, event_id: int, message: dict) -> None:
        conns = self._connections.get(event_id)
        if not conns:
            return
        payload = json.dumps(message)
        dead = []
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            conns.discard(ws)

    async def start_redis_listener(self, redis: Redis) -> None:
        pubsub = redis.pubsub()
        await pubsub.psubscribe("gala:*")

        async def _listen() -> None:
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                channel = message["channel"]
                if isinstance(channel, bytes):
                    channel = channel.decode()
                try:
                    event_id = int(channel.removeprefix("gala:"))
                    data = json.loads(message["data"])
                except (ValueError, TypeError):
                    continue
                await self.broadcast_local(event_id, data)

        self._pubsub_task = asyncio.create_task(_listen())

    async def stop_redis_listener(self) -> None:
        if self._pubsub_task is not None:
            self._pubsub_task.cancel()


gala_manager = GalaConnectionManager()


async def publish_gala_event(redis: Redis, event_id: int, message: dict) -> None:
    await redis.publish(f"gala:{event_id}", json.dumps(message))
