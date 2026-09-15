"""GET/POST .../email-outbox (R7 E2): a stuck queued/failed email was
previously invisible to BTC, with no way to see it or send it again."""

from app.models.notification import EmailOutbox


async def test_list_outbox_filters_by_status(client, world, auth_headers, db_session):
    db_session.add_all([
        EmailOutbox(
            event_id=world.event.id, to_email="a@test.vn", template_code="registration_confirmed",
            payload_json={}, dedupe_key="k-sent", status="sent",
        ),
        EmailOutbox(
            event_id=world.event.id, to_email="b@test.vn", template_code="registration_confirmed",
            payload_json={}, dedupe_key="k-failed", status="failed", attempts=3, last_error="boom",
        ),
    ])
    await db_session.commit()

    resp = await client.get(
        f"/api/events/{world.event.id}/email-outbox", headers=auth_headers(world.organizer_user)
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    resp = await client.get(
        f"/api/events/{world.event.id}/email-outbox?status_filter=failed",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["to_email"] == "b@test.vn"
    assert rows[0]["last_error"] == "boom"


async def test_list_outbox_is_admin_only(client, world, auth_headers):
    resp = await client.get(
        f"/api/events/{world.event.id}/email-outbox", headers=auth_headers(world.employee_user)
    )
    assert resp.status_code == 403


async def test_retry_requeues_failed_email_and_resets_attempts(client, world, auth_headers, db_session):
    outbox = EmailOutbox(
        event_id=world.event.id, to_email="c@test.vn", template_code="registration_confirmed",
        payload_json={}, dedupe_key="k-retry", status="failed", attempts=3, last_error="smtp down",
    )
    db_session.add(outbox)
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/email-outbox/{outbox.id}/retry",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "queued"
    assert body["attempts"] == 0
    assert body["last_error"] is None
    assert any(job[0] == "send_email" for job in client.fake_queue.jobs)


async def test_retry_rejects_already_sent_email(client, world, auth_headers, db_session):
    outbox = EmailOutbox(
        event_id=world.event.id, to_email="d@test.vn", template_code="registration_confirmed",
        payload_json={}, dedupe_key="k-sent2", status="sent",
    )
    db_session.add(outbox)
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/email-outbox/{outbox.id}/retry",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "already_sent"
