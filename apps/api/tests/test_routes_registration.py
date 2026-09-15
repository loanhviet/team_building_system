"""registration_service.submit_registration/assert_can_edit enforced at the
HTTP boundary: terms gate on submit, and edits blocked once the event leaves
registration_open (or its own record was cancelled)."""

import io
from datetime import timedelta

from openpyxl import load_workbook

from app.core.time import utcnow
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


async def test_edit_blocked_before_registration_open_time(
    client, world, auth_headers, db_session
):
    world.event.registration_open_at = utcnow() + timedelta(hours=1)
    await db_session.commit()
    resp = await client.put(
        f"/api/events/{world.event.id}/registrations/me",
        headers=auth_headers(world.employee_user),
        json={"wish_note": "too early"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "registration_not_open"


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


async def test_admin_list_includes_position_and_searches_code(client, world, auth_headers, db_session):
    world.employee.position = "Backend Eng"
    await db_session.commit()

    resp = await client.get(
        f"/api/events/{world.event.id}/registrations",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    row = next(r for r in resp.json() if r["employee_id"] == world.employee.id)
    assert row["position"] == "Backend Eng"
    assert row["team_code"] == world.team.code

    code = world.employee.employee_code
    resp = await client.get(
        f"/api/events/{world.event.id}/registrations?search={code}",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    assert any(r["employee_id"] == world.employee.id for r in resp.json())


async def test_remind_unsubmitted_is_admin_only_and_queues(client, world, auth_headers, db_session):
    db_session.add(
        Registration(
            event_id=world.event.id,
            employee_id=(await make_employee(db_session, team=world.team, site=world.site, code="NV009")).employee.id,
            status="draft",
        )
    )
    await db_session.commit()

    denied = await client.post(
        f"/api/events/{world.event.id}/registrations/remind",
        headers=auth_headers(world.employee_user),
    )
    assert denied.status_code == 403

    ok = await client.post(
        f"/api/events/{world.event.id}/registrations/remind",
        headers=auth_headers(world.organizer_user),
    )
    assert ok.status_code == 202
    assert ok.json()["queued"] >= 1


async def test_registration_confirmed_dedupes_by_content_not_just_registration_id(
    client, world, auth_headers, db_session,
):
    """R7 E5: resubmitting with the same content must not re-send; resubmitting
    with *different* content (a different Ca here) must send an updated email —
    the old dedupe key was `registration_confirmed:{reg.id}` alone, so a
    changed resubmission silently never got a fresh confirmation."""
    from sqlalchemy import select

    from app.models.event import Shift
    from app.models.notification import EmailOutbox

    shift2 = Shift(event_id=world.event.id, code="CA2", name="Ca 2", sort_order=2)
    db_session.add(shift2)
    await db_session.commit()

    await client.put(
        f"/api/events/{world.event.id}/registrations/me",
        headers=auth_headers(world.employee_user),
        json={"shift_id": world.shift.id},
    )
    resp = await client.post(
        f"/api/events/{world.event.id}/registrations/me/submit",
        headers=auth_headers(world.employee_user),
        json={"is_participating": True, "agreed_terms": True, "terms_version": "v1"},
    )
    assert resp.status_code == 200

    # identical resubmit — no new outbox row
    resp = await client.post(
        f"/api/events/{world.event.id}/registrations/me/submit",
        headers=auth_headers(world.employee_user),
        json={"is_participating": True, "agreed_terms": True, "terms_version": "v1"},
    )
    assert resp.status_code == 200
    rows = (
        await db_session.execute(
            select(EmailOutbox).where(EmailOutbox.template_code == "registration_confirmed")
        )
    ).scalars().all()
    assert len(rows) == 1

    # resubmit with a different Ca — content changed, a second email is queued
    await client.put(
        f"/api/events/{world.event.id}/registrations/me",
        headers=auth_headers(world.employee_user),
        json={"shift_id": shift2.id},
    )
    resp = await client.post(
        f"/api/events/{world.event.id}/registrations/me/submit",
        headers=auth_headers(world.employee_user),
        json={"is_participating": True, "agreed_terms": True, "terms_version": "v1"},
    )
    assert resp.status_code == 200
    rows = (
        await db_session.execute(
            select(EmailOutbox).where(EmailOutbox.template_code == "registration_confirmed")
        )
    ).scalars().all()
    assert len(rows) == 2
