"""Audit log actor/filter enrichment and job event-scoping added in R5 —
before this, `actor_user_id` was a bare int (no name shown), audit-logs had
no action/entity_type/time filters, and GET /jobs returned every event's
jobs mixed together with no way to scope the panel to one event."""

from app.models.enums import EventStatus


async def test_audit_log_exposes_actor_email_and_filters_by_action(
    client, world, auth_headers, db_session
):
    resp = await client.post(
        f"/api/events/{world.event.id}/registrations/me/submit",
        headers=auth_headers(world.employee_user),
        json={"is_participating": True, "agreed_terms": True, "terms_version": "v1"},
    )
    assert resp.status_code == 200

    resp = await client.get(
        f"/api/events/{world.event.id}/audit-logs", headers=auth_headers(world.organizer_user)
    )
    assert resp.status_code == 200
    logs = resp.json()
    submit_log = next(log for log in logs if log["action"] == "submit")
    assert submit_log["actor_email"] == world.employee_user.email

    resp = await client.get(
        f"/api/events/{world.event.id}/audit-logs?action=submit",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    assert all(log["action"] == "submit" for log in resp.json())

    resp = await client.get(
        f"/api/events/{world.event.id}/audit-logs?action=cancel",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    assert resp.json() == []


async def test_jobs_endpoint_scopes_by_event_id(client, world, auth_headers, db_session):
    world.event.status = EventStatus.registration_closed
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/allocations/flight",
        headers=auth_headers(world.organizer_user),
        json={"direction": "outbound"},
    )
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    resp = await client.get(
        f"/api/jobs?event_id={world.event.id}", headers=auth_headers(world.organizer_user)
    )
    assert resp.status_code == 200
    assert any(j["id"] == job_id for j in resp.json())

    resp = await client.get("/api/jobs?event_id=999999", headers=auth_headers(world.organizer_user))
    assert resp.status_code == 200
    assert all(j["id"] != job_id for j in resp.json())
