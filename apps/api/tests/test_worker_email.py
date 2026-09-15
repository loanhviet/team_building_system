"""worker.tasks.email.send_email retry behavior (R7 E1): ARQ's own
max_tries=3 does nothing unless the task explicitly raises `Retry` — a plain
exception (what aiosmtplib actually raises on a transient SMTP failure) was
silently recorded as a permanent failure with zero retries. Pins that a
transient failure now retries up to MAX_SEND_ATTEMPTS, then gives up cleanly
without raising (so the worker doesn't log a scary unhandled-exception
traceback for an already-handled, expected outcome)."""

import pytest
from arq import Retry
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.worker.tasks.email as email_task
from app.models.notification import EmailOutbox


@pytest.fixture
async def outbox_row(db_session):
    outbox = EmailOutbox(
        to_email="nv001@test.vn",
        template_code="registration_reminder",
        payload_json={"full_name": "NV001", "event_name": "Test Event", "app_url": "http://x"},
        dedupe_key="worker-test-1",
    )
    db_session.add(outbox)
    await db_session.commit()
    return outbox


@pytest.fixture
def route_worker_to_test_db(monkeypatch, test_engine):
    # send_email opens its own session via the module-level AsyncSessionLocal
    # (matches prod: the worker has no request-scoped session to reuse) — point
    # it at the same in-memory engine the test's db_session fixture uses.
    factory = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    monkeypatch.setattr(email_task, "AsyncSessionLocal", factory)


async def test_transient_failure_retries_then_gives_up(
    db_session, outbox_row, route_worker_to_test_db, monkeypatch
):
    async def boom(*args, **kwargs):
        raise ConnectionError("smtp temporarily unavailable")

    monkeypatch.setattr(email_task.aiosmtplib, "send", boom)

    for expected_attempts in (1, 2):
        with pytest.raises(Retry):
            await email_task.send_email({}, outbox_row.id)
        await db_session.refresh(outbox_row)
        assert outbox_row.attempts == expected_attempts
        assert outbox_row.status == "queued"  # still retryable, not a dead end
        assert outbox_row.last_error

    # third failure: MAX_SEND_ATTEMPTS reached, gives up without raising
    await email_task.send_email({}, outbox_row.id)
    await db_session.refresh(outbox_row)
    assert outbox_row.attempts == 3
    assert outbox_row.status == "failed"


async def test_success_after_a_transient_failure_marks_sent(
    db_session, outbox_row, route_worker_to_test_db, monkeypatch
):
    calls = {"n": 0}

    async def flaky(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise ConnectionError("smtp temporarily unavailable")

    monkeypatch.setattr(email_task.aiosmtplib, "send", flaky)

    with pytest.raises(Retry):
        await email_task.send_email({}, outbox_row.id)

    await email_task.send_email({}, outbox_row.id)
    await db_session.refresh(outbox_row)
    assert outbox_row.status == "sent"
    assert outbox_row.attempts == 2
