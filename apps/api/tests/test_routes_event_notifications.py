"""Email notifications for attendee-facing event changes."""

from sqlalchemy import select

from app.models.notification import EmailOutbox


async def test_changing_event_dates_notifies_confirmed_participants(
    client, world, auth_headers, db_session
):
    response = await client.patch(
        f"/api/events/{world.event.id}",
        headers=auth_headers(world.organizer_user),
        json={"start_date": "2026-12-20", "end_date": "2026-12-22"},
    )

    assert response.status_code == 200
    assert any(job[0] == "send_email" for job in client.fake_queue.jobs)
    result = await db_session.execute(
        select(EmailOutbox).where(EmailOutbox.template_code == "schedule_changed")
    )
    outbox = result.scalar_one()
    assert outbox.to_email == world.employee.email
    assert "thời gian tổ chức" in outbox.payload_json["change_summary"]


async def test_changing_only_registration_window_does_not_notify_participants(
    client, world, auth_headers
):
    response = await client.patch(
        f"/api/events/{world.event.id}",
        headers=auth_headers(world.organizer_user),
        json={"registration_open_at": "2026-12-01T08:00:00"},
    )

    assert response.status_code == 200
    assert not any(job[0] == "send_email" for job in client.fake_queue.jobs)
