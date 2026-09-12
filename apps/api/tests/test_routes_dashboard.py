"""GET /events/{id}/dashboard — R5 extended this with per-leg bus status and
flagged/no-leader counts so the admin dashboard can show real denominators
and link straight to what needs fixing before publishing."""

from app.models.bus import Bus, BusAssignment
from app.models.event import TransportLeg


async def test_dashboard_reports_buses_by_leg_and_flags(client, world, auth_headers, db_session):
    leg = TransportLeg(event_id=world.event.id, code="HN_SB", name="HN -> San bay", direction="outbound")
    db_session.add(leg)
    await db_session.flush()
    bus = Bus(event_id=world.event.id, leg_id=leg.id, code="XE01", capacity=10)  # no leader_name
    db_session.add(bus)
    await db_session.flush()
    db_session.add(
        BusAssignment(
            event_id=world.event.id, leg_id=leg.id, bus_id=bus.id, employee_id=world.employee.id,
            source="auto", is_flagged=True, flag_reason="no_slot",
        )
    )
    await db_session.commit()

    resp = await client.get(
        f"/api/events/{world.event.id}/dashboard", headers=auth_headers(world.organizer_user)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["buses_flagged_count"] == 1
    assert body["buses_without_leader_count"] == 1
    assert any(item["leg_name"] == "HN -> San bay" and item["assigned"] == 1 for item in body["buses_by_leg"])
