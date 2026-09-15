"""Audit log actor/filter enrichment and job event-scoping added in R5 —
before this, `actor_user_id` was a bare int (no name shown), audit-logs had
no action/entity_type/time filters, and GET /jobs returned every event's
jobs mixed together with no way to scope the panel to one event."""

from app.models.enums import EventStatus
from app.models.flight import Flight, FlightAssignment
from app.models.organization import Site


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
    db_session.add(
        Flight(
            event_id=world.event.id,
            flight_code="READY-01",
            direction="outbound",
            site_id=world.site.id,
            capacity=10,
        )
    )
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


async def test_publish_requires_explicit_confirmation_for_soft_warnings(
    client, world, auth_headers, db_session
):
    world.event.status = EventStatus.allocation_processing
    await db_session.commit()

    readiness = await client.get(
        f"/api/events/{world.event.id}/readiness",
        headers=auth_headers(world.organizer_user),
    )
    assert readiness.status_code == 200
    assert readiness.json()["ready"] is True
    assert any(item["code"] == "room_unassigned" for item in readiness.json()["warnings"])

    rejected = await client.post(
        f"/api/events/{world.event.id}/transition",
        headers=auth_headers(world.organizer_user),
        json={"status": "information_published"},
    )
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "publish_confirmation_required"

    confirmed = await client.post(
        f"/api/events/{world.event.id}/transition",
        headers=auth_headers(world.organizer_user),
        json={"status": "information_published", "confirm_warnings": True},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "information_published"


async def test_publish_cannot_bypass_physical_allocation_blocker(
    client, world, auth_headers, db_session
):
    other_site = Site(code="HCM", name="Ho Chi Minh")
    db_session.add(other_site)
    await db_session.flush()
    flight = Flight(
        event_id=world.event.id,
        flight_code="WRONG-SITE",
        direction="outbound",
        site_id=other_site.id,
        capacity=10,
    )
    db_session.add(flight)
    await db_session.flush()
    db_session.add(
        FlightAssignment(
            event_id=world.event.id,
            flight_id=flight.id,
            employee_id=world.employee.id,
            direction="outbound",
        )
    )
    world.event.status = EventStatus.allocation_processing
    await db_session.commit()

    readiness = await client.get(
        f"/api/events/{world.event.id}/readiness",
        headers=auth_headers(world.organizer_user),
    )
    assert readiness.status_code == 200
    assert readiness.json()["ready"] is False
    assert any(
        item["code"] == "flight_site_mismatch" for item in readiness.json()["blockers"]
    )

    rejected = await client.post(
        f"/api/events/{world.event.id}/transition",
        headers=auth_headers(world.organizer_user),
        json={"status": "information_published", "confirm_warnings": True},
    )
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "publish_blocked"
