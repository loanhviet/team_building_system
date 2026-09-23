"""Schedule visibility and notification rules."""

from sqlalchemy import select

from app.models.notification import EmailOutbox


def _schedule_email_jobs(client) -> list[tuple[str, tuple, dict]]:
    return [job for job in client.fake_queue.jobs if job[0] == "send_email"]  # type: ignore[attr-defined]


async def test_published_schedule_item_notifies_before_journey_is_published(
    client, world, auth_headers, db_session
):
    response = await client.post(
        f"/api/events/{world.event.id}/schedule-items",
        headers=auth_headers(world.organizer_user),
        json={
            "title": "Bay tới Đà Nẵng",
            "is_published": True,
            "start_at": "2026-12-20T08:00:00",
            "end_at": "2026-12-20T09:20:00",
        },
    )

    assert response.status_code == 201
    assert response.json()["is_published"] is True
    assert len(_schedule_email_jobs(client)) == 1
    result = await db_session.execute(
        select(EmailOutbox).where(EmailOutbox.template_code == "schedule_changed")
    )
    outbox = result.scalar_one()
    assert "Bay tới Đà Nẵng" in outbox.payload_json["change_summary"]
    assert "08:00" in outbox.payload_json["change_summary"]


async def test_second_schedule_edit_in_the_same_hour_sends_again(
    client, world, auth_headers, db_session
):
    created = await client.post(
        f"/api/events/{world.event.id}/schedule-items",
        headers=auth_headers(world.organizer_user),
        json={"title": "Khai mạc", "is_published": True, "start_at": "2026-12-20T09:00:00"},
    )
    item_id = created.json()["id"]
    updated = await client.patch(
        f"/api/events/{world.event.id}/schedule-items/{item_id}",
        headers=auth_headers(world.organizer_user),
        json={"start_at": "2026-12-20T10:00:00"},
    )

    assert updated.status_code == 200
    assert len(_schedule_email_jobs(client)) == 2


async def test_draft_schedule_item_stays_internal_and_does_not_notify(
    client, world, auth_headers, db_session
):
    response = await client.post(
        f"/api/events/{world.event.id}/schedule-items",
        headers=auth_headers(world.organizer_user),
        json={"title": "Nội bộ BTC", "is_published": False},
    )

    assert response.status_code == 201
    assert response.json()["is_published"] is False
    assert not _schedule_email_jobs(client)
