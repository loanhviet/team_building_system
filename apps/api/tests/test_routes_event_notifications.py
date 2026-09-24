"""Email notifications for attendee-facing event changes."""

from datetime import datetime

from sqlalchemy import select

from app.models.enums import EventStatus
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
    assert "Ngày bắt đầu: — → 2026-12-20" in outbox.payload_json["change_summary"]
    assert "Ngày kết thúc: — → 2026-12-22" in outbox.payload_json["change_summary"]


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


async def test_changing_shift_time_emails_people_on_that_shift(
    client, world, auth_headers, db_session
):
    response = await client.patch(
        f"/api/events/{world.event.id}/shifts/{world.shift.id}",
        headers=auth_headers(world.organizer_user),
        json={"depart_after_time": "18:00"},
    )

    assert response.status_code == 200
    result = await db_session.execute(
        select(EmailOutbox).where(EmailOutbox.template_code == "flight_changed")
    )
    outbox = result.scalar_one()
    assert outbox.to_email == world.employee.email
    assert "Ca 1" in outbox.payload_json["change_summary"]
    assert "18:00" in outbox.payload_json["change_summary"]


def _publish_jobs(client) -> list[tuple]:
    return [job for job in client.fake_queue.jobs if job[0] == "send_bulk_emails_task"]


async def test_republish_enqueues_a_fresh_info_published_email(
    client, world, auth_headers, db_session, monkeypatch
):
    stamps = iter([datetime(2026, 9, 24, 1, 0, 0), datetime(2026, 9, 24, 2, 0, 0)])
    monkeypatch.setattr("app.routers.events.utcnow", lambda: next(stamps))
    world.event.status = EventStatus.allocation_processing
    await db_session.commit()

    async def publish():
        return await client.post(
            f"/api/events/{world.event.id}/transition",
            headers=auth_headers(world.organizer_user),
            json={"status": "information_published", "confirm_warnings": True},
        )

    assert (await publish()).status_code == 200
    await db_session.refresh(world.event)
    world.event.status = EventStatus.allocation_processing
    await db_session.commit()
    assert (await publish()).status_code == 200

    jobs = _publish_jobs(client)
    assert [job[1] for job in jobs] == [
        (world.event.id, "info_published", "2026-09-24T01:00:00"),
        (world.event.id, "info_published", "2026-09-24T02:00:00"),
    ]


async def test_leaving_published_for_event_started_does_not_email(
    client, world, auth_headers, db_session
):
    world.event.status = EventStatus.information_published
    await db_session.commit()

    response = await client.post(
        f"/api/events/{world.event.id}/transition",
        headers=auth_headers(world.organizer_user),
        json={"status": "event_started"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "event_started"
    assert _publish_jobs(client) == []
    assert not any(job[0] == "send_email" for job in client.fake_queue.jobs)
