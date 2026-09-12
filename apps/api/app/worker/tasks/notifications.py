import logging

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.event import Event
from app.models.organization import Employee
from app.models.registration import Registration
from app.services.notification.email_service import enqueue_email

logger = logging.getLogger("worker")
settings = get_settings()


async def send_bulk_emails_task(ctx: dict, event_id: int, template_code: str) -> None:
    """Fan-out: one send_email job per submitted+participating employee, each
    deduped so re-running this (e.g. a retried publish) never double-sends."""
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

        queue = ctx["redis"]
        for employee in employees:
            await enqueue_email(
                db, queue, event_id=event_id, to_email=employee.email, template_code=template_code,
                payload={
                    "full_name": employee.full_name, "event_name": event.name,
                    "app_url": settings.app_base_url,
                },
                dedupe_key=f"{template_code}:{event_id}:{employee.id}",
            )
        await db.commit()
        logger.info(
            "send_bulk_emails_task: queued %s emails (%s) for event %s",
            len(employees), template_code, event_id,
        )
