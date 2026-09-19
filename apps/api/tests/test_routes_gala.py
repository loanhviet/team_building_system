"""PATCH .../gala/tables/{id} with is_active=false is how the admin panel
"deletes" a table (soft-delete, since gala_seats hang off it) — this pins the
guard added in R4: don't let that silently orphan a held/confirmed seat.

Also covers the R7 gala fixes: hold-time quota enforcement (G2), automatic
makeup turns when a team's turn ends short of quota (G1), draw preconditions
(G4), and the has_representative flag on turns (G5)."""

from datetime import timedelta
from io import BytesIO

from openpyxl import load_workbook
from sqlalchemy import select

from app.core.time import utcnow
from app.models.enums import EventStatus, UserRole
from app.models.gala import GalaConfig, GalaSeat, GalaTable, GalaTurn
from app.models.organization import Team
from app.models.registration import Registration
from app.services.gala.gala_service import expire_stale
from tests.conftest import make_employee


async def test_deleting_table_with_confirmed_seat_is_blocked(client, world, auth_headers, db_session):
    config = GalaConfig(event_id=world.event.id, name="Gala")
    db_session.add(config)
    await db_session.flush()
    table = GalaTable(event_id=world.event.id, code="B1", seat_count=2)
    db_session.add(table)
    await db_session.flush()
    seat1 = GalaSeat(table_id=table.id, seat_number=1, label="B1-1", status="confirmed", team_id=world.team.id)
    seat2 = GalaSeat(table_id=table.id, seat_number=2, label="B1-2", status="available")
    db_session.add_all([seat1, seat2])
    await db_session.commit()

    resp = await client.patch(
        f"/api/events/{world.event.id}/gala/tables/{table.id}",
        headers=auth_headers(world.organizer_user),
        json={"is_active": False},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "seats_in_use"

    # free the confirmed seat, then the same delete should succeed
    seat1.status = "available"
    seat1.team_id = None
    await db_session.commit()

    resp = await client.patch(
        f"/api/events/{world.event.id}/gala/tables/{table.id}",
        headers=auth_headers(world.organizer_user),
        json={"is_active": False},
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


async def _table_with_seats(db_session, event_id: int, code: str, n: int) -> GalaTable:
    table = GalaTable(event_id=event_id, code=code, seat_count=n)
    db_session.add(table)
    await db_session.flush()
    for i in range(1, n + 1):
        db_session.add(GalaSeat(table_id=table.id, seat_number=i, label=f"{code}-{i}"))
    await db_session.flush()
    return table


async def test_assign_occupant_validates_team_registration_and_journey(
    client, world, auth_headers, db_session,
):
    leader = await make_employee(
        db_session, team=world.team, site=world.site, code="NV900", role=UserRole.team_leader,
    )
    other = await make_employee(db_session, team=world.team, site=world.site, code="NV901")
    db_session.add(Registration(
        event_id=world.event.id, employee_id=other.employee.id,
        status="submitted", is_participating=True,
    ))
    db_session.add(GalaConfig(event_id=world.event.id, name="Gala"))
    table = await _table_with_seats(db_session, world.event.id, "B1", 2)
    seats = (await db_session.execute(
        select(GalaSeat).where(GalaSeat.table_id == table.id).order_by(GalaSeat.seat_number)
    )).scalars().all()
    for seat in seats:
        seat.status = "confirmed"
        seat.team_id = world.team.id
    world.event.status = EventStatus.information_published
    await db_session.commit()

    endpoint = f"/api/events/{world.event.id}/gala/seats/{seats[0].id}/occupant"
    denied = await client.put(endpoint, headers=auth_headers(world.employee_user),
                              json={"employee_id": world.employee.id})
    assert denied.status_code == 403
    invalid = await client.put(endpoint, headers=auth_headers(leader.user),
                               json={"employee_id": leader.employee.id})
    assert invalid.status_code == 400
    assigned = await client.put(endpoint, headers=auth_headers(leader.user),
                                json={"employee_id": world.employee.id})
    assert assigned.status_code == 200
    assert assigned.json()["employee_id"] == world.employee.id

    duplicate = await client.put(
        f"/api/events/{world.event.id}/gala/seats/{seats[1].id}/occupant",
        headers=auth_headers(leader.user), json={"employee_id": world.employee.id},
    )
    assert duplicate.status_code == 409

    other_team = Team(code="OTHER", name="Other Team")
    db_session.add(other_team)
    await db_session.flush()
    seats[1].team_id = other_team.id
    await db_session.commit()
    cross_team = await client.put(
        f"/api/events/{world.event.id}/gala/seats/{seats[1].id}/occupant",
        headers=auth_headers(leader.user), json={"employee_id": world.employee.id},
    )
    assert cross_team.status_code == 403

    journey = await client.get("/api/journey/me", headers=auth_headers(world.employee_user))
    assert journey.status_code == 200
    assert journey.json()["gala"]["my_seat"] == {
        "table_code": "B1", "table_name": None, "seat_number": 1, "label": "B1-1",
    }
    state = await client.get(
        f"/api/events/{world.event.id}/gala/state", headers=auth_headers(world.employee_user),
    )
    assert state.status_code == 200
    assert all(seat["employee_id"] is None for seat in state.json()["seats"])

    export = await client.get(
        f"/api/events/{world.event.id}/gala/occupants/export",
        headers=auth_headers(world.organizer_user),
    )
    assert export.status_code == 200
    sheet = load_workbook(BytesIO(export.content), read_only=True).active
    rows = list(sheet.values)
    assert rows[0] == ("Team", "Bàn", "Ghế", "Mã nhân viên", "Họ tên", "Đã điểm danh")
    assert rows[1][1:5] == ("B1", "B1-1", world.employee.employee_code, world.employee.full_name)
    private = await client.get(
        f"/api/events/{world.event.id}/gala/occupants/export",
        headers=auth_headers(world.employee_user),
    )
    assert private.status_code == 403

    cleared = await client.put(endpoint, headers=auth_headers(leader.user),
                               json={"employee_id": None})
    assert cleared.status_code == 200
    assert cleared.json()["employee_id"] is None


async def test_hold_exceeds_quota_is_rejected(client, world, auth_headers, db_session):
    leader = await make_employee(
        db_session, team=world.team, site=world.site, code="NV900", role=UserRole.team_leader
    )
    config = GalaConfig(event_id=world.event.id, name="Gala", fixed_quota=2, seat_quota_rule="fixed")
    db_session.add(config)
    table = await _table_with_seats(db_session, world.event.id, "B1", 3)
    turn = GalaTurn(
        event_id=world.event.id, team_id=world.team.id, order_no=1, seat_quota=2, status="active",
        started_at=utcnow(), expires_at=utcnow() + timedelta(minutes=5),
    )
    db_session.add(turn)
    await db_session.commit()

    seats = (
        await db_session.execute(select(GalaSeat).where(GalaSeat.table_id == table.id))
    ).scalars().all()
    seat_ids = [s.id for s in seats]

    for seat_id in seat_ids[:2]:
        resp = await client.post(
            f"/api/events/{world.event.id}/gala/seats/{seat_id}/hold",
            headers=auth_headers(leader.user),
        )
        assert resp.status_code == 200

    resp = await client.post(
        f"/api/events/{world.event.id}/gala/seats/{seat_ids[2]}/hold",
        headers=auth_headers(leader.user),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "quota_exceeded"


async def test_expired_turn_short_of_quota_gets_makeup_turn(client, world, auth_headers, db_session):
    config = GalaConfig(event_id=world.event.id, name="Gala", fixed_quota=2, seat_quota_rule="fixed")
    db_session.add(config)
    await _table_with_seats(db_session, world.event.id, "B1", 4)
    # already-expired active turn: nobody confirmed anything before time ran out
    turn = GalaTurn(
        event_id=world.event.id, team_id=world.team.id, order_no=1, seat_quota=2, status="active",
        started_at=utcnow() - timedelta(minutes=5), expires_at=utcnow() - timedelta(seconds=1),
    )
    db_session.add(turn)
    await db_session.commit()

    await expire_stale(db_session, client.fake_queue, world.event.id, config)
    await db_session.commit()

    result = await db_session.execute(
        select(GalaTurn).where(GalaTurn.event_id == world.event.id)
    )
    turns = result.scalars().all()
    assert any(t.status == "expired" for t in turns)
    makeup = [t for t in turns if t.is_makeup]
    assert len(makeup) == 1
    assert makeup[0].team_id == world.team.id
    assert makeup[0].seat_quota == 2  # nobody had confirmed, so the full quota carries over
    assert makeup[0].status == "active"  # auto-activated since the waiting queue was empty


async def test_draw_requires_registration_closed(client, world, auth_headers, db_session):
    resp = await client.post(
        f"/api/events/{world.event.id}/gala/draw", headers=auth_headers(world.organizer_user)
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_event_status"


async def test_draw_rejects_when_not_enough_seats(client, world, auth_headers, db_session):
    world.event.status = EventStatus.registration_closed
    config = GalaConfig(event_id=world.event.id, name="Gala", fixed_quota=5, seat_quota_rule="fixed")
    db_session.add(config)
    await _table_with_seats(db_session, world.event.id, "B1", 2)  # only 2 seats, quota needs 5
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/gala/draw", headers=auth_headers(world.organizer_user)
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "not_enough_seats"


async def test_turns_flag_teams_without_a_team_leader(client, world, auth_headers, db_session):
    world.event.status = EventStatus.registration_closed
    no_leader_team = Team(code="NOLEAD", name="No Leader Team")
    db_session.add(no_leader_team)
    await db_session.flush()
    await make_employee(db_session, team=no_leader_team, site=world.site, code="NV901")
    await make_employee(
        db_session, team=world.team, site=world.site, code="NV902", role=UserRole.team_leader
    )
    config = GalaConfig(event_id=world.event.id, name="Gala", fixed_quota=1, seat_quota_rule="fixed")
    db_session.add(config)
    await _table_with_seats(db_session, world.event.id, "B1", 10)
    turns = [
        GalaTurn(event_id=world.event.id, team_id=world.team.id, order_no=1, seat_quota=1, status="waiting"),
        GalaTurn(event_id=world.event.id, team_id=no_leader_team.id, order_no=2, seat_quota=1, status="waiting"),
    ]
    db_session.add_all(turns)
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/gala/turns/start", headers=auth_headers(world.organizer_user)
    )
    assert resp.status_code == 200

    resp = await client.get(
        f"/api/events/{world.event.id}/gala/state", headers=auth_headers(world.organizer_user)
    )
    by_team = {t["team_id"]: t for t in resp.json()["turns"]}
    assert by_team[world.team.id]["has_representative"] is True
    assert by_team[no_leader_team.id]["has_representative"] is False


async def test_fixed_quota_rule_requires_a_quota(client, world, auth_headers):
    """`compute_team_quota` returns `fixed_quota or 0` for this rule, so saving
    it empty drew a queue of quota-0 turns where the first seat click answered
    quota_exceeded — and draw_turns refuses to re-draw."""
    bad = await client.put(
        f"/api/events/{world.event.id}/gala/config",
        headers=auth_headers(world.organizer_user),
        json={"name": "Gala Dinner", "seat_quota_rule": "fixed"},
    )
    assert bad.status_code == 422

    zero = await client.put(
        f"/api/events/{world.event.id}/gala/config",
        headers=auth_headers(world.organizer_user),
        json={"name": "Gala Dinner", "seat_quota_rule": "fixed", "fixed_quota": 0},
    )
    assert zero.status_code == 422

    ok = await client.put(
        f"/api/events/{world.event.id}/gala/config",
        headers=auth_headers(world.organizer_user),
        json={"name": "Gala Dinner", "seat_quota_rule": "fixed", "fixed_quota": 8},
    )
    assert ok.status_code == 200
    assert ok.json()["fixed_quota"] == 8

    unknown = await client.put(
        f"/api/events/{world.event.id}/gala/config",
        headers=auth_headers(world.organizer_user),
        json={"name": "Gala Dinner", "seat_quota_rule": "by_headcount"},
    )
    assert unknown.status_code == 422
