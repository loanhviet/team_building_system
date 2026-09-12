from arq import ArqRedis
from fastapi import status as http_status
from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.time import utcnow
from app.models.notification import EmailOutbox, EmailTemplate

DEFAULT_TEMPLATES = {
    "registration_confirmed": {
        "subject": "Xác nhận đăng ký Team Building - {{ event_name }}",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>Bạn đã đăng ký tham gia <b>{{ event_name }}</b> thành công với thông tin:</p>"
            "<ul>"
            "<li>Team: {{ team_name }}</li>"
            "<li>Tham gia: {{ participating_label }}</li>"
            "<li>Ca đăng ký: {{ shift_name }}</li>"
            "<li>Nhu cầu xe: {{ transport_summary }}</li>"
            "</ul>"
            "<p><a href='{{ app_url }}'>Xem chi tiết trên hệ thống</a></p>"
        ),
    },
    "info_published": {
        "subject": "Thông tin hành trình {{ event_name }} đã được công bố",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>BTC đã công bố thông tin chuyến bay, xe đưa đón, khách sạn và lịch trình cho "
            "<b>{{ event_name }}</b>.</p>"
            "<p><a href='{{ app_url }}'>Xem hành trình của bạn</a></p>"
        ),
    },
    "flight_changed": {
        "subject": "Thay đổi thông tin chuyến bay - {{ event_name }}",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>Thông tin chuyến bay của bạn cho <b>{{ event_name }}</b> vừa được BTC cập nhật.</p>"
            "<p><a href='{{ app_url }}'>Xem chi tiết mới nhất</a></p>"
        ),
    },
    "bus_changed": {
        "subject": "Thay đổi thông tin xe đưa đón - {{ event_name }}",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>Thông tin xe đưa đón của bạn cho <b>{{ event_name }}</b> vừa được BTC cập nhật.</p>"
            "<p><a href='{{ app_url }}'>Xem chi tiết mới nhất</a></p>"
        ),
    },
    "schedule_changed": {
        "subject": "Cập nhật lịch trình - {{ event_name }}",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>Lịch trình <b>{{ event_name }}</b> vừa được BTC cập nhật.</p>"
            "<p><a href='{{ app_url }}'>Xem lịch trình mới nhất</a></p>"
        ),
    },
}

TEMPLATE_DESCRIPTIONS = {
    "registration_confirmed": "Gửi khi CBNV gửi đăng ký",
    "info_published": "Gửi khi BTC công bố hành trình",
    "flight_changed": "Gửi khi BTC đổi chuyến bay của CBNV",
    "bus_changed": "Gửi khi BTC đổi xe của CBNV",
    "schedule_changed": "Gửi khi BTC sửa lịch trình (sau khi đã công bố)",
}

PUBLISHED_STATUSES = ("information_published", "event_started", "event_completed")


async def _load_template(db: AsyncSession, event_id: int | None, code: str) -> tuple[str, str]:
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.code == code, EmailTemplate.event_id == event_id)
    )
    tmpl = result.scalar_one_or_none()
    if tmpl is None and event_id is not None:
        result = await db.execute(
            select(EmailTemplate).where(EmailTemplate.code == code, EmailTemplate.event_id.is_(None))
        )
        tmpl = result.scalar_one_or_none()
    if tmpl is not None:
        return tmpl.subject, tmpl.body_html
    default = DEFAULT_TEMPLATES[code]
    return default["subject"], default["body_html"]


async def render_email(
    db: AsyncSession, event_id: int | None, code: str, context: dict
) -> tuple[str, str]:
    subject_tpl, body_tpl = await _load_template(db, event_id, code)
    return Template(subject_tpl).render(**context), Template(body_tpl).render(**context)


async def enqueue_email(
    db: AsyncSession,
    *,
    event_id: int | None,
    to_email: str,
    template_code: str,
    payload: dict,
    dedupe_key: str,
) -> int | None:
    """Writes the outbox row only — does NOT touch the queue. The worker loads
    the row by id on its own DB connection, so enqueuing the ARQ job before the
    caller's transaction commits is a race: a fast worker can look up the row
    before it's visible, find nothing, and the email is silently never sent
    (the job returns cleanly, no retry). Callers must `await db.commit()` and
    then call `dispatch_email`/`dispatch_emails` with the id(s) this returns.

    Returns None (nothing to dispatch) when `dedupe_key` already exists.
    """
    result = await db.execute(select(EmailOutbox).where(EmailOutbox.dedupe_key == dedupe_key))
    if result.scalar_one_or_none() is not None:
        return None  # already queued/sent — idempotent no-op

    outbox = EmailOutbox(
        event_id=event_id,
        to_email=to_email,
        template_code=template_code,
        payload_json=payload,
        dedupe_key=dedupe_key,
    )
    db.add(outbox)
    await db.flush()
    return outbox.id


async def dispatch_email(queue: ArqRedis, outbox_id: int | None) -> None:
    if outbox_id is not None:
        await queue.enqueue_job("send_email", outbox_id)


async def dispatch_emails(queue: ArqRedis, outbox_ids: list[int]) -> None:
    for outbox_id in outbox_ids:
        await dispatch_email(queue, outbox_id)


async def list_templates(db: AsyncSession, event_id: int) -> list[dict]:
    result = await db.execute(
        select(EmailTemplate).where(
            (EmailTemplate.event_id == event_id) | (EmailTemplate.event_id.is_(None))
        )
    )
    by_code: dict[str, EmailTemplate] = {}
    for row in result.scalars().all():
        existing = by_code.get(row.code)
        if existing is None or (existing.event_id is None and row.event_id == event_id):
            by_code[row.code] = row

    out: list[dict] = []
    for code, default in DEFAULT_TEMPLATES.items():
        stored = by_code.get(code)
        out.append(
            {
                "code": code,
                "subject": stored.subject if stored else default["subject"],
                "body_html": stored.body_html if stored else default["body_html"],
                "description": TEMPLATE_DESCRIPTIONS.get(code, stored.description if stored else None),
                "is_custom": stored is not None and stored.event_id == event_id,
            }
        )
    return out


async def upsert_event_template(
    db: AsyncSession, event_id: int, code: str, subject: str, body_html: str
) -> dict:
    if code not in DEFAULT_TEMPLATES:
        raise AppError("unknown_template", f"Không có mẫu email '{code}'", http_status.HTTP_400_BAD_REQUEST)

    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.code == code, EmailTemplate.event_id == event_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = EmailTemplate(
            event_id=event_id,
            code=code,
            subject=subject,
            body_html=body_html,
            description=TEMPLATE_DESCRIPTIONS.get(code),
        )
        db.add(row)
    else:
        row.subject = subject
        row.body_html = body_html
    await db.flush()
    return {
        "code": row.code,
        "subject": row.subject,
        "body_html": row.body_html,
        "description": TEMPLATE_DESCRIPTIONS.get(code),
        "is_custom": True,
    }


async def enqueue_schedule_changed(queue, event, item_id: int) -> None:
    if event.status.value not in PUBLISHED_STATUSES:
        return
    suffix = f"item{item_id}:{utcnow().strftime('%Y%m%d%H')}"
    await queue.enqueue_job("send_bulk_emails_task", event.id, "schedule_changed", suffix)
