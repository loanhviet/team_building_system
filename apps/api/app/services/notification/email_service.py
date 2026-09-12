from arq import ArqRedis
from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
}


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
    queue: ArqRedis,
    *,
    event_id: int | None,
    to_email: str,
    template_code: str,
    payload: dict,
    dedupe_key: str,
) -> None:
    result = await db.execute(select(EmailOutbox).where(EmailOutbox.dedupe_key == dedupe_key))
    if result.scalar_one_or_none() is not None:
        return  # already queued/sent — idempotent no-op

    outbox = EmailOutbox(
        event_id=event_id,
        to_email=to_email,
        template_code=template_code,
        payload_json=payload,
        dedupe_key=dedupe_key,
    )
    db.add(outbox)
    await db.flush()
    await queue.enqueue_job("send_email", outbox.id)
