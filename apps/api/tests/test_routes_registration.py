"""registration_service.submit_registration/assert_can_edit enforced at the
HTTP boundary: terms gate on submit, and edits blocked once the event leaves
registration_open (or its own record was cancelled)."""

import io

from openpyxl import load_workbook

from app.models.enums import EventStatus
from app.models.registration import Registration
from tests.conftest import make_employee


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


async def test_latest_registration_survives_registration_closed(client, world, auth_headers, db_session):
    # world already has a submitted registration on the registration_open event
    resp = await client.get("/api/registrations/me", headers=auth_headers(world.employee_user))
    assert resp.status_code == 200
    assert resp.json()["id"] == world.registration.id

    world.event.status = EventStatus.registration_closed
    await db_session.commit()

    # GET /events/current would now return null — the unscoped endpoint must
    # still find this registration so the CBNV can see what they submitted
    resp = await client.get("/api/registrations/me", headers=auth_headers(world.employee_user))
    assert resp.status_code == 200
    assert resp.json()["id"] == world.registration.id


async def test_latest_registration_null_when_event_completed(client, world, auth_headers, db_session):
    world.event.status = EventStatus.event_completed
    await db_session.commit()

    resp = await client.get("/api/registrations/me", headers=auth_headers(world.employee_user))
    assert resp.status_code == 200
    assert resp.json() is None


async def test_export_respects_active_filters(client, world, auth_headers, db_session):
    """Regression test for §3.6: export must apply the same filters as the
    on-screen list, not silently dump the whole event."""
    other = await make_employee(db_session, team=world.team, site=world.site, code="NV002")
    db_session.add(
        Registration(
            event_id=world.event.id, employee_id=other.employee.id, status="draft",
            is_participating=None,
        )
    )
    await db_session.commit()

    resp_all = await client.get(
        f"/api/events/{world.event.id}/registrations/export",
        headers=auth_headers(world.organizer_user),
    )
    assert resp_all.status_code == 200
    wb_all = load_workbook(io.BytesIO(resp_all.content))
    assert wb_all.active.max_row - 1 == 2  # header + both registrations

    resp_filtered = await client.get(
        f"/api/events/{world.event.id}/registrations/export?status_filter=submitted",
        headers=auth_headers(world.organizer_user),
    )
    assert resp_filtered.status_code == 200
    wb_filtered = load_workbook(io.BytesIO(resp_filtered.content))
    assert wb_filtered.active.max_row - 1 == 1
    assert wb_filtered.active.cell(row=2, column=1).value == world.employee.employee_code
