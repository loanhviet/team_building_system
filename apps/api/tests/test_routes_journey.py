"""journey_service.resolve_published_event gates /api/journey/me on the event
actually being published — pinned at the HTTP layer since this is the one
screen that must never leak pre-publish allocation data to a CBNV."""

from app.models.enums import EventStatus
from app.models.event import Shift
from app.models.schedule import ScheduleItem


async def test_admin_can_preview_one_employee_before_publish(client, world, auth_headers):
    resp = await client.get(
        f"/api/journey/me?event_id={world.event.id}&employee_id={world.employee.id}",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["employee_code"] == world.employee.employee_code
    assert body["full_name"] == world.employee.full_name
    for key in ("flights", "buses", "room", "gala"):
        assert key in body


async def test_employee_cannot_preview_someone_else(client, world, auth_headers, db_session):
    from tests.conftest import make_employee

    other = await make_employee(db_session, team=world.team, site=world.site, code="NV777")
    world.event.status = EventStatus.information_published
    await db_session.commit()

    resp = await client.get(
        f"/api/journey/me?event_id={world.event.id}&employee_id={other.employee.id}",
        headers=auth_headers(world.employee_user),
    )
    assert resp.status_code == 200
    assert resp.json()["employee_code"] == world.employee.employee_code


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


async def test_events_mine_and_journey_event_id(client, world, auth_headers, db_session):
    world.event.status = EventStatus.information_published
    await db_session.commit()
    headers = auth_headers(world.employee_user)

    mine = await client.get("/api/events/mine", headers=headers)
    assert mine.status_code == 200
    body = mine.json()
    assert any(e["id"] == world.event.id and e["has_journey"] for e in body)

    ok = await client.get(f"/api/journey/me?event_id={world.event.id}", headers=headers)
    assert ok.status_code == 200
    missing = await client.get("/api/journey/me?event_id=999999", headers=headers)
    assert missing.status_code == 404
