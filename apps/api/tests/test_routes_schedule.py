"""Schedule visibility and notification rules."""

from app.models.enums import EventStatus


def _schedule_email_jobs(client) -> list[tuple[str, tuple, dict]]:
    return [
        job for job in client.fake_queue.jobs  # type: ignore[attr-defined]
        if job[0] == "send_bulk_emails_task" and job[1][1] == "schedule_changed"
    ]


async def test_published_schedule_item_is_visible_and_notifies_participants(
    client, world, auth_headers, db_session
):
    world.event.status = EventStatus.information_published
    await db_session.commit()

    response = await client.post(
        f"/api/events/{world.event.id}/schedule-items",
        headers=auth_headers(world.organizer_user),
        json={"title": "Bay tới Đà Nẵng", "is_published": True},
    )

    assert response.status_code == 201
    assert response.json()["is_published"] is True
    assert len(_schedule_email_jobs(client)) == 1


async def test_draft_schedule_item_stays_internal_and_does_not_notify(
    client, world, auth_headers, db_session
):
    world.event.status = EventStatus.information_published
    await db_session.commit()

    response = await client.post(
        f"/api/events/{world.event.id}/schedule-items",
        headers=auth_headers(world.organizer_user),
        json={"title": "Nội bộ BTC", "is_published": False},
    )

    assert response.status_code == 201
    assert response.json()["is_published"] is False
    assert not _schedule_email_jobs(client)
