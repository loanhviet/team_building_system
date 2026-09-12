"""PATCH .../gala/tables/{id} with is_active=false is how the admin panel
"deletes" a table (soft-delete, since gala_seats hang off it) — this pins the
guard added in R4: don't let that silently orphan a held/confirmed seat."""

from app.models.gala import GalaConfig, GalaSeat, GalaTable


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
