from app.services.notification.email_service import DEFAULT_TEMPLATES, TEMPLATE_DESCRIPTIONS


def test_schedule_changed_template_exists():
    assert "schedule_changed" in DEFAULT_TEMPLATES
    assert "{{ event_name }}" in DEFAULT_TEMPLATES["schedule_changed"]["subject"]
    assert "{{ app_url }}" in DEFAULT_TEMPLATES["schedule_changed"]["body_html"]
    assert "change_summary" in DEFAULT_TEMPLATES["schedule_changed"]["body_html"]


def test_every_default_template_has_description():
    assert set(DEFAULT_TEMPLATES) == set(TEMPLATE_DESCRIPTIONS)


def test_preview_template_renders_sample_context():
    from app.services.notification.email_service import preview_template

    subject, body = preview_template("Hello {{ full_name }}", "<p>{{ event_name }}</p>")
    assert subject == "Hello Nguyễn Văn A"
    assert "Team Building 2026" in body


async def test_restore_default_template_drops_event_override(client, world, auth_headers):
    resp = await client.put(
        f"/api/events/{world.event.id}/email-templates/registration_confirmed",
        headers=auth_headers(world.organizer_user),
        json={"subject": "Custom subject", "body_html": "<p>custom</p>"},
    )
    assert resp.status_code == 200
    assert resp.json()["is_custom"] is True

    resp = await client.delete(
        f"/api/events/{world.event.id}/email-templates/registration_confirmed",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_custom"] is False
    assert body["subject"] != "Custom subject"


async def test_send_test_email_is_admin_only(client, world, auth_headers):
    denied = await client.post(
        f"/api/events/{world.event.id}/email-templates/registration_confirmed/test",
        headers=auth_headers(world.employee_user),
        json={"subject": "Hi {{ full_name }}", "body_html": "<p>{{ event_name }}</p>"},
    )
    assert denied.status_code == 403

    ok = await client.post(
        f"/api/events/{world.event.id}/email-templates/registration_confirmed/test",
        headers=auth_headers(world.organizer_user),
        json={"subject": "Hi {{ full_name }}", "body_html": "<p>{{ event_name }}</p>"},
    )
    assert ok.status_code == 202
    assert ok.json()["to"] == world.organizer_user.email


async def test_build_email_context_includes_journey_data(world, db_session):
    from app.models.enums import EventStatus
    from app.models.flight import Flight, FlightAssignment
    from app.services.notification.email_service import build_email_context

    world.event.status = EventStatus.information_published
    flight = Flight(
        event_id=world.event.id, flight_code="VN900", direction="outbound",
        origin="HAN", destination="DAD", capacity=5,
    )
    db_session.add(flight)
    await db_session.flush()
    db_session.add(
        FlightAssignment(
            event_id=world.event.id, flight_id=flight.id, employee_id=world.employee.id,
            direction="outbound", source="auto",
        )
    )
    await db_session.commit()

    context = await build_email_context(db_session, world.event, world.employee)

    assert context["full_name"] == world.employee.full_name
    assert context["journey"]["flights"][0]["flight_code"] == "VN900"


async def test_notify_employees_renders_flight_changed_with_flight_code(world, db_session):
    """Regression for E4: before this, flight_changed/bus_changed/info_published
    payloads carried no flight/bus data at all, so the template could reference
    a flight code but the real email never had one to show."""
    from app.models.enums import EventStatus
    from app.models.flight import Flight, FlightAssignment
    from app.services.notification.email_service import notify_employees, render_email
    from tests.conftest import FakeQueue

    world.event.status = EventStatus.information_published
    flight = Flight(
        event_id=world.event.id, flight_code="VN901", direction="outbound",
        origin="HAN", destination="DAD", capacity=5,
    )
    db_session.add(flight)
    await db_session.flush()
    db_session.add(
        FlightAssignment(
            event_id=world.event.id, flight_id=flight.id, employee_id=world.employee.id,
            direction="outbound", source="auto",
        )
    )
    await db_session.commit()

    queue = FakeQueue()
    await notify_employees(
        db_session, queue, world.event, [world.employee.id], "flight_changed", dedupe_suffix="t1",
    )
    assert any(job[0] == "send_email" for job in queue.jobs)

    from sqlalchemy import select

    from app.models.notification import EmailOutbox

    outbox = (
        await db_session.execute(
            select(EmailOutbox).where(EmailOutbox.template_code == "flight_changed")
        )
    ).scalar_one()
    _subject, body = await render_email(db_session, world.event.id, "flight_changed", outbox.payload_json)
    assert "VN901" in body


def test_upsert_rejects_unknown_code():
    import asyncio

    from app.core.errors import AppError
    from app.services.notification.email_service import upsert_event_template

    async def run() -> None:
        try:
            await upsert_event_template(None, 1, "not_a_template", "s", "b")  # type: ignore[arg-type]
        except AppError as exc:
            assert exc.code == "unknown_template"
            return
        raise AssertionError("expected AppError")

    asyncio.run(run())
