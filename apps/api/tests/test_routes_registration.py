"""registration_service.submit_registration/assert_can_edit enforced at the
HTTP boundary: terms gate on submit, and edits blocked once the event leaves
registration_open (or its own record was cancelled)."""

from app.models.enums import EventStatus


async def test_submit_without_agreeing_terms_is_rejected(client, world, auth_headers):
    resp = await client.post(
        f"/api/events/{world.event.id}/registrations/me/submit",
        headers=auth_headers(world.employee_user),
        json={"is_participating": True, "agreed_terms": False},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "terms_not_agreed"


async def test_submit_succeeds_when_terms_agreed(client, world, auth_headers):
    resp = await client.post(
        f"/api/events/{world.event.id}/registrations/me/submit",
        headers=auth_headers(world.employee_user),
        json={"is_participating": True, "agreed_terms": True, "terms_version": "v1"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "submitted"


async def test_edit_blocked_after_registration_closed(client, world, auth_headers, db_session):
    world.event.status = EventStatus.registration_closed
    await db_session.commit()

    resp = await client.put(
        f"/api/events/{world.event.id}/registrations/me",
        headers=auth_headers(world.employee_user),
        json={"is_participating": True},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "registration_closed"
