import random
from datetime import timedelta

from fastapi import status
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.time import utcnow
from app.core.ws_manager import publish_gala_event
from app.models.gala import GalaConfig, GalaSeat, GalaTable, GalaTurn
from app.models.organization import Employee
from app.models.registration import Registration
from app.services.gala.seat_lock import acquire_seat_lock, release_seat_lock


def auto_table_position(index: int) -> tuple[int, int]:
    return 40 + (index % 3) * 220, 28 + (index // 3) * 200


async def compute_team_quota(db: AsyncSession, event_id: int, team_id: int, config: GalaConfig) -> int:
    if config.seat_quota_rule == "fixed":
        return config.fixed_quota or 0
    result = await db.execute(
        select(func.count(Employee.id))
        .join(Registration, Registration.employee_id == Employee.id)
        .where(
            Employee.team_id == team_id,
            Registration.event_id == event_id,
            Registration.status == "submitted",
            Registration.is_participating.is_(True),
        )
    )
    return result.scalar_one()


async def draw_turns(db: AsyncSession, event_id: int, config: GalaConfig, team_ids: list[int]) -> None:
    existing = await db.execute(select(GalaTurn.id).where(GalaTurn.event_id == event_id).limit(1))
    if existing.scalar_one_or_none() is not None:
        raise AppError(
            "already_drawn",
            "Đã bốc thăm rồi. Không thể bốc lại khi đã có thứ tự Team.",
            status.HTTP_409_CONFLICT,
        )
    seed = random.randint(0, 2**31 - 1)
    rng = random.Random(seed)
    order = list(team_ids)
    rng.shuffle(order)

    for i, team_id in enumerate(order, start=1):
        quota = await compute_team_quota(db, event_id, team_id, config)
        db.add(
            GalaTurn(
                event_id=event_id, team_id=team_id, order_no=i, seat_quota=quota,
                status="waiting",
            )
        )

    config.draw_seed = seed
    config.status = "drawing"
    await db.flush()


async def _activate_turn(db: AsyncSession, config: GalaConfig, turn: GalaTurn) -> None:
    turn.status = "active"
    turn.started_at = utcnow()
    turn.expires_at = utcnow() + timedelta(seconds=config.turn_duration_seconds)


async def get_active_turn(db: AsyncSession, event_id: int) -> GalaTurn | None:
    result = await db.execute(
        select(GalaTurn).where(GalaTurn.event_id == event_id, GalaTurn.status == "active")
    )
    return result.scalar_one_or_none()


async def _next_waiting_turn(db: AsyncSession, event_id: int) -> GalaTurn | None:
    result = await db.execute(
        select(GalaTurn)
        .where(GalaTurn.event_id == event_id, GalaTurn.status == "waiting")
        .order_by(GalaTurn.order_no)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _activate_next_waiting(db: AsyncSession, event_id: int, config: GalaConfig) -> GalaTurn | None:
    next_turn = await _next_waiting_turn(db, event_id)
    if next_turn is not None:
        await _activate_turn(db, config, next_turn)
        config.status = "in_progress"
    else:
        config.status = "finished"
    await db.flush()
    return next_turn


async def advance_turn(db: AsyncSession, event_id: int, config: GalaConfig) -> GalaTurn | None:
    """Marks the current active turn done and activates the next waiting turn, if any."""
    active = await get_active_turn(db, event_id)
    if active is not None and active.status == "active":
        active.status = "done"
    return await _activate_next_waiting(db, event_id, config)


async def start_turn(db: AsyncSession, event_id: int, config: GalaConfig) -> GalaTurn:
    if await get_active_turn(db, event_id) is not None:
        raise AppError("turn_active", "Đã có lượt đang chạy", status.HTTP_409_CONFLICT)
    waiting = await _next_waiting_turn(db, event_id)
    if waiting is None:
        raise AppError(
            "no_waiting_turn",
            "Không còn lượt chờ. Hãy bốc thăm trước.",
            status.HTTP_400_BAD_REQUEST,
        )
    await _activate_turn(db, config, waiting)
    config.status = "in_progress"
    await db.flush()
    return waiting


async def skip_turn(
    db: AsyncSession, redis: Redis, event_id: int, config: GalaConfig
) -> GalaTurn | None:
    active = await get_active_turn(db, event_id)
    if active is None:
        raise AppError("no_active_turn", "Không có lượt đang chạy để bỏ qua", status.HTTP_400_BAD_REQUEST)
    active.status = "skipped"

    result = await db.execute(
        select(GalaSeat).where(GalaSeat.status == "held", GalaSeat.held_by_team_id == active.team_id)
    )
    for seat in result.scalars().all():
        table = await db.get(GalaTable, seat.table_id)
        if table is None or table.event_id != event_id:
            continue
        await release_seat_lock(redis, seat.id, active.team_id)
        seat.status = "available"
        seat.held_by_team_id = None
        seat.hold_expires_at = None
        seat.version += 1
        await publish_gala_event(
            redis, event_id, {"type": "seat_update", "seat_id": seat.id, "status": "available"}
        )

    next_turn = await _activate_next_waiting(db, event_id, config)
    await publish_gala_event(
        redis,
        event_id,
        {
            "type": "turn_update",
            "team_id": next_turn.team_id if next_turn else None,
            "expires_at": next_turn.expires_at.isoformat() if next_turn else None,
            "finished": next_turn is None,
        },
    )
    return next_turn


async def set_seat_blocked(
    db: AsyncSession, redis: Redis, event_id: int, seat_id: int, blocked: bool
) -> GalaSeat:
    seat = await db.get(GalaSeat, seat_id)
    if seat is None:
        raise AppError("not_found", "Ghế không tồn tại", status.HTTP_404_NOT_FOUND)
    table = await db.get(GalaTable, seat.table_id)
    if table is None or table.event_id != event_id:
        raise AppError("not_found", "Ghế không thuộc event này", status.HTTP_404_NOT_FOUND)

    if blocked:
        if seat.status not in ("available", "blocked"):
            raise AppError(
                "seat_busy",
                "Chỉ khoá được ghế đang trống",
                status.HTTP_409_CONFLICT,
            )
        seat.status = "blocked"
        seat.held_by_team_id = None
        seat.hold_expires_at = None
    else:
        if seat.status != "blocked":
            raise AppError("not_blocked", "Ghế này không bị khoá", status.HTTP_400_BAD_REQUEST)
        seat.status = "available"
    seat.version += 1
    await db.flush()
    await publish_gala_event(
        redis, event_id, {"type": "seat_update", "seat_id": seat.id, "status": seat.status}
    )
    return seat


async def expire_stale(db: AsyncSession, redis: Redis, event_id: int, config: GalaConfig) -> None:
    now = utcnow()

    result = await db.execute(
        select(GalaSeat).where(GalaSeat.status == "held", GalaSeat.hold_expires_at < now)
    )
    for seat in result.scalars().all():
        table = await db.get(GalaTable, seat.table_id)
        if table is None or table.event_id != event_id:
            continue
        if seat.held_by_team_id is not None:
            await release_seat_lock(redis, seat.id, seat.held_by_team_id)
        seat.status = "available"
        seat.held_by_team_id = None
        seat.hold_expires_at = None
        seat.version += 1
        await publish_gala_event(
            redis, event_id, {"type": "seat_update", "seat_id": seat.id, "status": "available"}
        )

    turn = await get_active_turn(db, event_id)
    if turn is not None and turn.expires_at is not None and turn.expires_at < now:
        active = turn
        active.status = "expired"
        next_turn = await advance_turn(db, event_id, config)
        await publish_gala_event(
            redis, event_id,
            {
                "type": "turn_update",
                "team_id": next_turn.team_id if next_turn else None,
                "expires_at": next_turn.expires_at.isoformat() if next_turn else None,
                "finished": next_turn is None,
            },
        )
    await db.flush()


async def hold_seat(
    db: AsyncSession, redis: Redis, event_id: int, config: GalaConfig, seat_id: int, team_id: int
) -> GalaSeat:
    turn = await get_active_turn(db, event_id)
    if turn is None or turn.team_id != team_id:
        raise AppError("not_your_turn", "Chưa đến lượt của Team bạn", status.HTTP_403_FORBIDDEN)

    seat = await db.get(GalaSeat, seat_id)
    if seat is None:
        raise AppError("not_found", "Ghế không tồn tại", status.HTTP_404_NOT_FOUND)
    table = await db.get(GalaTable, seat.table_id)
    if table is None or table.event_id != event_id:
        raise AppError("not_found", "Ghế không thuộc event này", status.HTTP_404_NOT_FOUND)
    if seat.status != "available":
        raise AppError("seat_unavailable", "Ghế đã có người chọn", status.HTTP_409_CONFLICT)

    acquired = await acquire_seat_lock(redis, seat_id, team_id, config.hold_ttl_seconds)
    if not acquired:
        raise AppError("seat_unavailable", "Ghế đã có người chọn", status.HTTP_409_CONFLICT)

    seat.status = "held"
    seat.held_by_team_id = team_id
    seat.hold_expires_at = utcnow() + timedelta(seconds=config.hold_ttl_seconds)
    seat.version += 1
    await db.flush()

    await publish_gala_event(
        redis, event_id,
        {"type": "seat_update", "seat_id": seat.id, "status": "held", "held_by_team_id": team_id},
    )
    return seat


async def release_seat(
    db: AsyncSession, redis: Redis, event_id: int, seat_id: int, team_id: int
) -> None:
    seat = await db.get(GalaSeat, seat_id)
    if seat is None or seat.status != "held" or seat.held_by_team_id != team_id:
        return
    await release_seat_lock(redis, seat_id, team_id)
    seat.status = "available"
    seat.held_by_team_id = None
    seat.hold_expires_at = None
    seat.version += 1
    await db.flush()
    await publish_gala_event(
        redis, event_id, {"type": "seat_update", "seat_id": seat.id, "status": "available"}
    )


async def confirm_seat(
    db: AsyncSession, redis: Redis, event_id: int, config: GalaConfig, seat_id: int,
    team_id: int, employee_id: int | None = None,
) -> GalaSeat:
    turn = await get_active_turn(db, event_id)
    if turn is None or turn.team_id != team_id:
        raise AppError("not_your_turn", "Chưa đến lượt của Team bạn", status.HTTP_403_FORBIDDEN)

    result = await db.execute(
        select(func.count(GalaSeat.id)).where(
            GalaSeat.team_id == team_id, GalaSeat.status == "confirmed"
        )
    )
    already_confirmed = result.scalar_one()
    if already_confirmed >= turn.seat_quota:
        raise AppError(
            "quota_exceeded", f"Team đã chọn đủ {turn.seat_quota} ghế", status.HTTP_409_CONFLICT
        )

    seat = await db.get(GalaSeat, seat_id)
    if seat is None or seat.status != "held" or seat.held_by_team_id != team_id:
        raise AppError("seat_not_held", "Ghế không ở trạng thái bạn đang giữ", status.HTTP_409_CONFLICT)

    expected_version = seat.version
    result = await db.execute(
        select(GalaSeat).where(GalaSeat.id == seat_id, GalaSeat.version == expected_version)
    )
    if result.scalar_one_or_none() is None:
        raise AppError("seat_conflict", "Ghế vừa bị thay đổi, vui lòng thử lại", status.HTTP_409_CONFLICT)

    await release_seat_lock(redis, seat_id, team_id)
    seat.status = "confirmed"
    seat.team_id = team_id
    seat.employee_id = employee_id
    seat.held_by_team_id = None
    seat.hold_expires_at = None
    seat.version += 1
    await db.flush()

    await publish_gala_event(
        redis, event_id,
        {"type": "seat_update", "seat_id": seat.id, "status": "confirmed", "team_id": team_id},
    )

    if already_confirmed + 1 >= turn.seat_quota:
        next_turn = await advance_turn(db, event_id, config)
        await publish_gala_event(
            redis, event_id,
            {
                "type": "turn_update",
                "team_id": next_turn.team_id if next_turn else None,
                "expires_at": next_turn.expires_at.isoformat() if next_turn else None,
                "finished": next_turn is None,
            },
        )

    return seat
