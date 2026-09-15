import logging
from email.message import EmailMessage

import aiosmtplib
from arq import Retry

from app.core.config import get_settings
from app.core.time import utcnow
from app.db.session import AsyncSessionLocal
from app.models.notification import EmailOutbox
from app.services.notification.email_service import render_email

logger = logging.getLogger("worker")
settings = get_settings()

MAX_SEND_ATTEMPTS = 3


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
            logger.exception("send_email failed for outbox %s (attempt %s)", outbox_id, outbox.attempts)
            outbox.last_error = str(exc)
            # ARQ's own max_tries=3 on this function (worker/settings.py) does
            # nothing on its own — it only retries a job that raises `Retry`;
            # a plain exception (what aiosmtplib/the SMTP server actually
            # raises) is recorded as a permanently failed job and never
            # retried. Without this, a transient SMTP hiccup meant the email
            # was just gone, silently, with nothing in the UI to say so.
            if outbox.attempts < MAX_SEND_ATTEMPTS:
                outbox.status = "queued"
                await db.commit()
                raise Retry(defer=outbox.attempts * 30) from exc
            outbox.status = "failed"
            await db.commit()
            return  # gave up — visible as "failed" in the email outbox log for BTC to retry manually

        outbox.status = "sent"
        outbox.sent_at = utcnow()
        await db.commit()
