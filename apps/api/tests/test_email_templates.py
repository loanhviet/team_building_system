from app.services.notification.email_service import DEFAULT_TEMPLATES, TEMPLATE_DESCRIPTIONS


def test_schedule_changed_template_exists():
    assert "schedule_changed" in DEFAULT_TEMPLATES
    assert "{{ event_name }}" in DEFAULT_TEMPLATES["schedule_changed"]["subject"]
    assert "{{ app_url }}" in DEFAULT_TEMPLATES["schedule_changed"]["body_html"]


def test_every_default_template_has_description():
    assert set(DEFAULT_TEMPLATES) == set(TEMPLATE_DESCRIPTIONS)


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
