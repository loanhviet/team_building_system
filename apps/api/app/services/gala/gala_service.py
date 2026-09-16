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


async def resize_table_seats(db: AsyncSession, table: GalaTable, new_seat_count: int) -> None:
    """Keep `gala_seats` in sync with `GalaTable.seat_count`. Growing appends new
    `available` seats; shrinking refuses if any seat past the new count is
    already held/confirmed/blocked — resize doesn't get to silently evict
    someone's chosen seat."""
    result = await db.execute(
        select(GalaSeat).where(GalaSeat.table_id == table.id).order_by(GalaSeat.seat_number)
    )
    seats = list(result.scalars().all())

    if new_seat_count > len(seats):
        for n in range(len(seats) + 1, new_seat_count + 1):
            db.add(GalaSeat(table_id=table.id, seat_number=n, label=f"{table.code}-{n}"))
    elif new_seat_count < len(seats):
        to_remove = seats[new_seat_count:]
        if any(s.status != "available" for s in to_remove):
            raise AppError(
                "seats_in_use",
                "Không thể giảm số ghế: có ghế đã được giữ/xác nhận trong phần bị cắt",
                status.HTTP_409_CONFLICT,
            )
        for s in to_remove:
            await db.delete(s)

    table.seat_count = new_seat_count
    await db.flush()


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

    quota_by_team = {
        team_id: await compute_team_quota(db, event_id, team_id, config) for team_id in team_ids
    }
    total_quota = sum(quota_by_team.values())
    # count real, selectable `gala_seats` rows rather than summing
    # `GalaTable.seat_count`: seats BTC has blocked (reserved for khách mời)
    # can never be confirmed by a team, so counting them here let a draw
    # through that the floor plan can't actually satisfy
    total_seats = (
        await db.execute(
            select(func.count(GalaSeat.id))
            .join(GalaTable, GalaTable.id == GalaSeat.table_id)
            .where(
                GalaTable.event_id == event_id,
                GalaTable.is_active.is_(True),
                GalaSeat.status != "blocked",
            )
        )
    ).scalar_one()
    if total_seats < total_quota:
        raise AppError(
            "not_enough_seats",
            f"Tổng ghế hiện có ({total_seats}) không đủ cho tổng hạn mức các Team "
            f"({total_quota}). Thêm bàn trước khi bốc thăm.",
            status.HTTP_400_BAD_REQUEST,
        )

    seed = random.randint(0, 2**31 - 1)
    rng = random.Random(seed)
    order = list(team_ids)
    rng.shuffle(order)

    for i, team_id in enumerate(order, start=1):
        db.add(
            GalaTurn(
                event_id=event_id, team_id=team_id, order_no=i, seat_quota=quota_by_team[team_id],
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


async def _confirmed_seat_count(db: AsyncSession, event_id: int, team_id: int) -> int:
    result = await db.execute(
        select(func.count(GalaSeat.id))
        .join(GalaTable, GalaTable.id == GalaSeat.table_id)
        .where(GalaTable.event_id == event_id, GalaSeat.team_id == team_id, GalaSeat.status == "confirmed")
    )
    return result.scalar_one()


async def _held_or_confirmed_count(db: AsyncSession, event_id: int, team_id: int) -> int:
    result = await db.execute(
        select(func.count(GalaSeat.id))
        .join(GalaTable, GalaTable.id == GalaSeat.table_id)
        .where(
            GalaTable.event_id == event_id,
            GalaSeat.status.in_(["held", "confirmed"]),
            (GalaSeat.team_id == team_id) | (GalaSeat.held_by_team_id == team_id),
        )
    )
    return result.scalar_one()


async def _spawn_makeup_turns(db: AsyncSession, event_id: int) -> list[GalaTurn]:
    """A team whose turn ran out (expired) or was skipped without filling its
    quota gets exactly one follow-up turn, appended once the normal queue is
    empty — otherwise a team that missed its window (BTC skipped it, or
    nobody showed up in time) is permanently shut out (BRD §8 has no "too
    bad" case). Capped at one makeup per team so a team that's simply never
    represented can't loop the queue forever."""
    result = await db.execute(
        select(GalaTurn).where(
            GalaTurn.event_id == event_id, GalaTurn.status.in_(["expired", "skipped"])
        )
    )
    ended = result.scalars().all()
    if not ended:
        return []

    already_makeup = {
        row[0]
        for row in (
            await db.execute(
                select(GalaTurn.team_id).where(
                    GalaTurn.event_id == event_id, GalaTurn.is_makeup.is_(True)
                )
            )
        ).all()
    }
    max_order = (
        await db.execute(
            select(func.coalesce(func.max(GalaTurn.order_no), 0)).where(GalaTurn.event_id == event_id)
        )
    ).scalar_one()

    spawned: list[GalaTurn] = []
    seen_teams: set[int] = set()
    for turn in ended:
        if turn.team_id in already_makeup or turn.team_id in seen_teams:
            continue
        confirmed = await _confirmed_seat_count(db, event_id, turn.team_id)
        if confirmed >= turn.seat_quota:
            continue
        seen_teams.add(turn.team_id)
        max_order += 1
        # full original quota, NOT the remainder: every quota check in this
        # module (`_confirmed_seat_count`, `_held_or_confirmed_count`) counts a
        # team's seats cumulatively across the whole event, so a makeup turn
        # carrying only the remainder made those checks compare a cumulative
        # count against a partial quota — a team that had confirmed 6 of 12
        # before its turn ran out got `quota_exceeded` on the first click of
        # its makeup turn (6 >= 12-6) and could never use it. The admin panel
        # already derives "còn lại" itself from quota - confirmed.
        new_turn = GalaTurn(
            event_id=event_id, team_id=turn.team_id, order_no=max_order,
            seat_quota=turn.seat_quota, status="waiting", is_makeup=True,
        )
        db.add(new_turn)
        spawned.append(new_turn)

    if spawned:
        await db.flush()
    return spawned


async def _activate_next_waiting(db: AsyncSession, event_id: int, config: GalaConfig) -> GalaTurn | None:
    next_turn = await _next_waiting_turn(db, event_id)
    if next_turn is None and await _spawn_makeup_turns(db, event_id):
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


async def _release_team_holds(
    db: AsyncSession, redis: Redis, event_id: int, team_id: int
) -> None:
    """Free every seat this team is still merely *holding*. Called whenever the
    team's turn ends — skipped or expired — so the next team never inherits a
    dead hold. Expiry used to rely on each seat's own `hold_expires_at`
    instead, which only works while `hold_ttl_seconds < turn_duration_seconds`;
    both are BTC-configurable, so a longer hold TTL parked the previous team's
    seats into the next team's turn."""
    result = await db.execute(
        select(GalaSeat).where(GalaSeat.status == "held", GalaSeat.held_by_team_id == team_id)
    )
    for seat in result.scalars().all():
        table = await db.get(GalaTable, seat.table_id)
        if table is None or table.event_id != event_id:
            continue
        await release_seat_lock(redis, seat.id, team_id)
        seat.status = "available"
        seat.held_by_team_id = None
        seat.hold_expires_at = None
        seat.version += 1
        await publish_gala_event(
            redis, event_id, {"type": "seat_update", "seat_id": seat.id, "status": "available"}
        )


async def skip_turn(
    db: AsyncSession, redis: Redis, event_id: int, config: GalaConfig
) -> GalaTurn | None:
    active = await get_active_turn(db, event_id)
    if active is None:
        raise AppError("no_active_turn", "Không có lượt đang chạy để bỏ qua", status.HTTP_400_BAD_REQUEST)
    active.status = "skipped"

    await _release_team_holds(db, redis, event_id, active.team_id)

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
        # same as skip_turn: the team's turn is over, so its holds go back to
        # the pool now rather than whenever each seat's own TTL happens to run out
        await _release_team_holds(db, redis, event_id, active.team_id)
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
    # the seat map hides inactive tables, but the frontend only hides UI — a
    # deactivated table's seats are excluded from the drawn capacity, so
    # letting one be held would overshoot the floor plan
    if not table.is_active:
        raise AppError("table_inactive", "Bàn này đã bị vô hiệu hoá", status.HTTP_409_CONFLICT)
    if seat.status != "available":
        raise AppError("seat_unavailable", "Ghế đã có người chọn", status.HTTP_409_CONFLICT)

    # previously only confirm_seat counted against quota — a team could hold
    # (and thereby block) more seats than it's allowed to ever confirm, tying
    # them up until the hold TTL expired
    held_or_confirmed = await _held_or_confirmed_count(db, event_id, team_id)
    if held_or_confirmed >= turn.seat_quota:
        raise AppError(
            "quota_exceeded", f"Team đã giữ/chọn đủ {turn.seat_quota} ghế", status.HTTP_409_CONFLICT
        )

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
        {
            "type": "seat_update", "seat_id": seat.id, "status": "held", "held_by_team_id": team_id,
            "hold_expires_at": seat.hold_expires_at.isoformat(),
        },
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

    already_confirmed = await _confirmed_seat_count(db, event_id, team_id)
    if already_confirmed >= turn.seat_quota:
        raise AppError(
            "quota_exceeded", f"Team đã chọn đủ {turn.seat_quota} ghế", status.HTTP_409_CONFLICT
        )

    seat = await db.get(GalaSeat, seat_id)
    if seat is None or seat.status != "held" or seat.held_by_team_id != team_id:
        raise AppError("seat_not_held", "Ghế không ở trạng thái bạn đang giữ", status.HTTP_409_CONFLICT)

    # (no optimistic-lock re-check here: within this single request/session
    # `seat` is already the identity-mapped row from the db.get() above, and
    # nothing else could have committed a change to it in between — the
    # actual protection against two teams confirming the same seat is the
    # Redis lock acquired in hold_seat() plus the held_by_team_id check just
    # above, not `version`. `version` still gets bumped below for the
    # optimistic-lock story other callers may rely on later.)
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
