"""journey_service.resolve_published_event gates /api/journey/me on the event
actually being published — pinned at the HTTP layer since this is the one
screen that must never leak pre-publish allocation data to a CBNV."""

from app.models.enums import EventStatus


async def test_journey_404_before_event_published(client, world, auth_headers):
    resp = await client.get("/api/journey/me", headers=auth_headers(world.employee_user))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "no_published_event"


async def test_journey_200_after_event_published(client, world, auth_headers, db_session):
    world.event.status = EventStatus.information_published
    await db_session.commit()

    resp = await client.get("/api/journey/me", headers=auth_headers(world.employee_user))
    assert resp.status_code == 200
    body = resp.json()
    assert body["event_id"] == world.event.id
    assert body["full_name"] == world.employee.full_name
    assert body["is_participating"] is True
    for key in ("flights", "buses", "room", "gala", "schedule", "announcements"):
        assert key in body
