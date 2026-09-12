"""journey_service.resolve_published_event gates /api/journey/me on the event
actually being published — pinned at the HTTP layer since this is the one
screen that must never leak pre-publish allocation data to a CBNV."""

from app.models.enums import EventStatus
from app.models.event import Shift
from app.models.schedule import ScheduleItem


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


async def test_journey_schedule_filters_by_shift_audience(client, world, auth_headers, db_session):
    """Regression: audience="shift" items used to reach everyone regardless
    of the viewer's own shift — only audience="team" was ever checked."""
    other_shift = Shift(event_id=world.event.id, code="CA2", name="Ca 2", sort_order=2)
    db_session.add(other_shift)
    await db_session.flush()
    db_session.add_all([
        ScheduleItem(
            event_id=world.event.id, title="Chi Ca 1", audience="shift",
            audience_ref_id=world.shift.id, is_published=True,
        ),
        ScheduleItem(
            event_id=world.event.id, title="Chi Ca 2", audience="shift",
            audience_ref_id=other_shift.id, is_published=True,
        ),
    ])
    world.event.status = EventStatus.information_published
    await db_session.commit()

    resp = await client.get("/api/journey/me", headers=auth_headers(world.employee_user))
    assert resp.status_code == 200
    titles = [item["title"] for item in resp.json()["schedule"]]
    assert "Chi Ca 1" in titles
    assert "Chi Ca 2" not in titles
