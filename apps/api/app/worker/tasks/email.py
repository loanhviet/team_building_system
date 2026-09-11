import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import get_settings
from app.core.time import utcnow
from app.db.session import AsyncSessionLocal
from app.models.notification import EmailOutbox
from app.services.notification.email_service import render_email

logger = logging.getLogger("worker")
settings = get_settings()


async def send_email(ctx: dict, outbox_id: int) -> None:
    async with AsyncSessionLocal() as db:
        outbox = await db.get(EmailOutbox, outbox_id)
        if outbox is None:
            logger.error("send_email: outbox %s not found", outbox_id)
            return
        if outbox.status == "sent":
            return  # idempotent — already delivered

        subject, body_html = await render_email(
            db, outbox.event_id, outbox.template_code, outbox.payload_json
        )

        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = outbox.to_email
        message["Subject"] = subject
        message.set_content("Vui lòng mở email này bằng trình đọc hỗ trợ HTML.")
        message.add_alternative(body_html, subtype="html")

        outbox.attempts += 1
        try:
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user or None,
                password=settings.smtp_pass or None,
                use_tls=settings.smtp_use_tls,
            )
        except Exception as exc:
            logger.exception("send_email failed for outbox %s", outbox_id)
            outbox.status = "failed"
            outbox.last_error = str(exc)
            await db.commit()
            raise  # re-raise so ARQ retries per the task's max_tries

        outbox.status = "sent"
        outbox.sent_at = utcnow()
        await db.commit()
