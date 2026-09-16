from datetime import timedelta

import pytest

from app.core.errors import AppError
from app.core.time import utcnow
from app.models.enums import EventStatus
from app.models.event import Event
from app.models.gala import GalaConfig, GalaSeat, GalaTable, GalaTurn
from app.models.organization import Site, Team
from app.services.gala.gala_service import (
    _activate_next_waiting,
    auto_table_position,
    confirm_seat,
    draw_turns,
    expire_stale,
    get_active_turn,
    hold_seat,
)
from tests.conftest import FakeQueue


def test_auto_table_position_fills_rows_of_three():
    assert auto_table_position(0) == (40, 28)
    assert auto_table_position(1) == (260, 28)
    assert auto_table_position(2) == (480, 28)
    assert auto_table_position(3) == (40, 228)


@pytest.mark.asyncio
async def test_makeup_turn_keeps_full_quota_so_partial_team_can_finish(db_session):
    """A team that confirmed some seats before its turn ran out must be able to
    use its makeup turn. The makeup turn carries the team's full quota because
    every quota check counts seats cumulatively per team."""
    site = Site(code="HN", name="Ha Noi")
    team = Team(code="ENG", name="Engineering")
    db_session.add_all([site, team])
    await db_session.flush()
    event = Event(code="G1", name="Gala", status=EventStatus.registration_closed)
    db_session.add(event)
    await db_session.flush()

    config = GalaConfig(event_id=event.id, name="Gala Dinner", status="in_progress")
    table = GalaTable(event_id=event.id, code="B1", seat_count=6)
    db_session.add_all([config, table])
    await db_session.flush()
    seats = [GalaSeat(table_id=table.id, seat_number=n, label=f"B1-{n}") for n in range(1, 7)]
    db_session.add_all(seats)
    # quota 4, two already confirmed, then the turn expired
    turn = GalaTurn(
        event_id=event.id, team_id=team.id, order_no=1, seat_quota=4, status="expired"
    )
    db_session.add(turn)
    await db_session.flush()
    for seat in seats[:2]:
        seat.status = "confirmed"
        seat.team_id = team.id
    await db_session.flush()

    makeup = await _activate_next_waiting(db_session, event.id, config)

    assert makeup is not None and makeup.is_makeup
    assert makeup.seat_quota == 4  # full quota, not the remaining 2

    redis = FakeQueue()
    held = await hold_seat(db_session, redis, event.id, config, seats[2].id, team.id)
    assert held.status == "held"
    confirmed = await confirm_seat(db_session, redis, event.id, config, seats[2].id, team.id)
    assert confirmed.status == "confirmed"


@pytest.mark.asyncio
async def test_seat_on_deactivated_table_cannot_be_held(db_session):
    site = Site(code="HN2", name="Ha Noi")
    team = Team(code="OPS", name="Ops")
    db_session.add_all([site, team])
    await db_session.flush()
    event = Event(code="G2", name="Gala", status=EventStatus.registration_closed)
    db_session.add(event)
    await db_session.flush()
    config = GalaConfig(event_id=event.id, name="Gala Dinner", status="in_progress")
    table = GalaTable(event_id=event.id, code="B9", seat_count=2, is_active=False)
    db_session.add_all([config, table])
    await db_session.flush()
    seat = GalaSeat(table_id=table.id, seat_number=1, label="B9-1")
    turn = GalaTurn(event_id=event.id, team_id=team.id, order_no=1, seat_quota=2, status="active")
    db_session.add_all([seat, turn])
    await db_session.commit()

    with pytest.raises(AppError) as exc:
        await hold_seat(db_session, FakeQueue(), event.id, config, seat.id, team.id)
    assert exc.value.code == "table_inactive"


@pytest.mark.asyncio
async def test_draw_excludes_blocked_seats_from_capacity(db_session):
    team = Team(code="FIN", name="Finance")
    site = Site(code="HN3", name="Ha Noi")
    db_session.add_all([team, site])
    await db_session.flush()
    event = Event(code="G3", name="Gala", status=EventStatus.registration_closed)
    db_session.add(event)
    await db_session.flush()
    config = GalaConfig(
        event_id=event.id, name="Gala Dinner", seat_quota_rule="fixed", fixed_quota=3
    )
    table = GalaTable(event_id=event.id, code="B1", seat_count=3)
    db_session.add_all([config, table])
    await db_session.flush()
    db_session.add_all([
        GalaSeat(table_id=table.id, seat_number=1, status="blocked"),
        GalaSeat(table_id=table.id, seat_number=2),
        GalaSeat(table_id=table.id, seat_number=3),
    ])
    await db_session.commit()

    with pytest.raises(AppError) as exc:
        await draw_turns(db_session, event.id, config, [team.id])
    assert exc.value.code == "not_enough_seats"


@pytest.mark.asyncio
async def test_expired_turn_releases_its_holds_even_with_a_long_hold_ttl(db_session):
    """hold_ttl_seconds and turn_duration_seconds are both BTC-configurable; a
    hold TTL longer than the turn used to park the previous team's seats inside
    the next team's turn."""
    team_a = Team(code="A", name="Team A")
    team_b = Team(code="B", name="Team B")
    db_session.add_all([team_a, team_b])
    await db_session.flush()
    event = Event(code="G4", name="Gala", status=EventStatus.registration_closed)
    db_session.add(event)
    await db_session.flush()
    # hold outlives the turn: 600s hold on a 60s turn
    config = GalaConfig(
        event_id=event.id, name="Gala Dinner", status="in_progress",
        turn_duration_seconds=60, hold_ttl_seconds=600,
    )
    table = GalaTable(event_id=event.id, code="B1", seat_count=4)
    db_session.add_all([config, table])
    await db_session.flush()
    seats = [GalaSeat(table_id=table.id, seat_number=n, label=f"B1-{n}") for n in range(1, 5)]
    turn_a = GalaTurn(
        event_id=event.id, team_id=team_a.id, order_no=1, seat_quota=2, status="active",
        started_at=utcnow() - timedelta(seconds=120),
        expires_at=utcnow() - timedelta(seconds=60),
    )
    turn_b = GalaTurn(
        event_id=event.id, team_id=team_b.id, order_no=2, seat_quota=2, status="waiting"
    )
    db_session.add_all([*seats, turn_a, turn_b])
    await db_session.flush()
    redis = FakeQueue()
    # team A holds a seat, then its turn runs out before confirming
    await hold_seat(db_session, redis, event.id, config, seats[0].id, team_a.id)
    assert seats[0].status == "held"

    await expire_stale(db_session, redis, event.id, config)

    assert seats[0].status == "available"
    assert seats[0].held_by_team_id is None
    # and team B can take that very seat on its own turn
    active = await get_active_turn(db_session, event.id)
    assert active is not None and active.team_id == team_b.id
    taken = await hold_seat(db_session, redis, event.id, config, seats[0].id, team_b.id)
    assert taken.held_by_team_id == team_b.id
