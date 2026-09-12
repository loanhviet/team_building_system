from redis.asyncio import Redis

# Compare-and-delete: only release the lock if it's still held by the caller,
# so a delayed release from an already-expired hold can't clobber someone else's.
_RELEASE_SCRIPT = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


def _key(seat_id: int) -> str:
    return f"gala:seat_lock:{seat_id}"


async def acquire_seat_lock(redis: Redis, seat_id: int, team_id: int, ttl_seconds: int) -> bool:
    return bool(await redis.set(_key(seat_id), str(team_id), nx=True, ex=ttl_seconds))


async def release_seat_lock(redis: Redis, seat_id: int, team_id: int) -> bool:
    result = await redis.eval(_RELEASE_SCRIPT, 1, _key(seat_id), str(team_id))
    return bool(result)


async def get_seat_lock_owner(redis: Redis, seat_id: int) -> int | None:
    value = await redis.get(_key(seat_id))
    if value is None:
        return None
    return int(value)
