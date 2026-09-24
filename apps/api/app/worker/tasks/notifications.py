import logging

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.event import Event
from app.models.organization import Employee
from app.models.registration import Registration
from app.services.notification.email_service import (
    build_email_context,
    dispatch_emails,
    enqueue_email,
)

logger = logging.getLogger("worker")
settings = get_settings()


async def send_bulk_emails_task(
    ctx: dict, event_id: int, template_code: str, dedupe_suffix: str = ""
) -> None:
    """Fan-out: one send_email job per submitted+participating employee.

    The dedupe key includes dedupe_suffix, so an ARQ retry of the same job
    does not double-send, while a later republish (a new suffix) does.
    info_published runs only after the event is already published, so the
    journey exists to build each person's context. A single agenda edit is
    sent inline by notify_visible_schedule_change."""
    async with AsyncSessionLocal() as db:
        event = await db.get(Event, event_id)
        if event is None:
            logger.error("send_bulk_emails_task: event %s not found", event_id)
            return

        result = await db.execute(
            select(Employee)
            .join(Registration, Registration.employee_id == Employee.id)
            .where(
                Registration.event_id == event_id,
                Registration.status == "submitted",
                Registration.is_participating.is_(True),
            )
        )
        employees = result.scalars().all()

        outbox_ids = []
        for employee in employees:
            context = await build_email_context(db, event, employee)
            outbox_id = await enqueue_email(
                db, event_id=event_id, to_email=employee.email, template_code=template_code,
                payload=context,
                dedupe_key=f"{template_code}:{event_id}:{employee.id}:{dedupe_suffix}".rstrip(":"),
            )
            outbox_ids.append(outbox_id)
        await db.commit()
        # dispatch only after commit — see enqueue_email's docstring. This is
        # exactly the loop where the race used to bite hardest: 100+ jobs fired
        # into Redis while the row for job #1 might still be uncommitted.
        queue = ctx["redis"]
        await dispatch_emails(queue, [oid for oid in outbox_ids if oid is not None])
        logger.info(
            "send_bulk_emails_task: queued %s emails (%s) for event %s",
            len(employees), template_code, event_id,
        )


async def remind_unsubmitted_task(ctx: dict, event_id: int) -> None:
    """One reminder per CBNV who hasn't answered this event's registration —
    same set the endpoint counted and BTC confirmed (see
    `registration_service.unsubmitted_employees`), which includes people with
    no registration row at all, not just drafts. Deduped per employee per UTC
    day so BTC can nudge again tomorrow without spamming."""
    from app.core.time import utcnow
    from app.services.registration_service import reminder_dedupe_key, unsubmitted_employees

    async with AsyncSessionLocal() as db:
        event = await db.get(Event, event_id)
        if event is None:
            logger.error("remind_unsubmitted_task: event %s not found", event_id)
            return

        employees = await unsubmitted_employees(db, event_id)
        day = utcnow().date().isoformat()
        outbox_ids = []
        for employee in employees:
            outbox_id = await enqueue_email(
                db,
                event_id=event_id,
                to_email=employee.email,
                template_code="registration_reminder",
                payload={
                    "full_name": employee.full_name,
                    "event_name": event.name,
                    "app_url": settings.app_base_url,
                },
                dedupe_key=reminder_dedupe_key(event_id, employee.id, day),
            )
            outbox_ids.append(outbox_id)
        await db.commit()
        queue = ctx["redis"]
        await dispatch_emails(queue, [oid for oid in outbox_ids if oid is not None])
        logger.info(
            "remind_unsubmitted_task: queued %s reminders for event %s",
            len(employees),
            event_id,
        )
