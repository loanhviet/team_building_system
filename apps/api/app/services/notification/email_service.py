from arq import ArqRedis
from fastapi import status as http_status
from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.time import utcnow
from app.models.event import Event
from app.models.notification import EmailOutbox, EmailTemplate
from app.models.organization import Employee

_settings = get_settings()

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
            "{% if journey.flights %}<ul>"
            "{% for f in journey.flights %}<li>Chuyến bay ({{ f.direction }}): {{ f.flight_code }} — "
            "{{ f.origin }} → {{ f.destination }}{% if f.depart_at %}, khởi hành {{ f.depart_at }}{% endif %}"
            "</li>{% endfor %}</ul>{% endif %}"
            "{% if journey.buses %}<ul>"
            "{% for b in journey.buses %}<li>Xe ({{ b.leg_name }}): {{ b.bus_code }}"
            "{% if b.gather_at %}, tập trung {{ b.gather_at }}{% endif %}"
            "{% if b.leader_name %}, TX {{ b.leader_name }}{% endif %}</li>{% endfor %}</ul>{% endif %}"
            "{% if journey.room %}<p>Phòng: {{ journey.room.hotel_name }} - "
            "{{ journey.room.room_number }}</p>{% endif %}"
            "{% if journey.gala and journey.gala.tables %}<p>Gala: "
            "{% for t in journey.gala.tables %}Bàn {{ t.table_code }}{% if not loop.last %}, {% endif %}"
            "{% endfor %}</p>{% endif %}"
            "<p><a href='{{ app_url }}'>Xem hành trình của bạn</a></p>"
        ),
    },
    "flight_changed": {
        "subject": "Thay đổi thông tin chuyến bay - {{ event_name }}",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>Thông tin chuyến bay của bạn cho <b>{{ event_name }}</b> vừa được BTC cập nhật.</p>"
            "{% if journey.flights %}<ul>"
            "{% for f in journey.flights %}<li>Chuyến bay ({{ f.direction }}): {{ f.flight_code }} — "
            "{{ f.origin }} → {{ f.destination }}{% if f.depart_at %}, khởi hành {{ f.depart_at }}{% endif %}"
            "</li>{% endfor %}</ul>{% endif %}"
            "<p><a href='{{ app_url }}'>Xem chi tiết mới nhất</a></p>"
        ),
    },
    "bus_changed": {
        "subject": "Thay đổi thông tin xe đưa đón - {{ event_name }}",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>Thông tin xe đưa đón của bạn cho <b>{{ event_name }}</b> vừa được BTC cập nhật.</p>"
            "{% if journey.buses %}<ul>"
            "{% for b in journey.buses %}<li>Xe ({{ b.leg_name }}): {{ b.bus_code }}"
            "{% if b.gather_at %}, tập trung {{ b.gather_at }}{% endif %}"
            "{% if b.leader_name %}, TX {{ b.leader_name }}{% endif %}</li>{% endfor %}</ul>{% endif %}"
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
    "registration_reminder": {
        "subject": "Nhắc đăng ký {{ event_name }}",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>Bạn chưa gửi đăng ký tham gia <b>{{ event_name }}</b>.</p>"
            "<p>Vui lòng vào cổng nội bộ để hoàn tất trước hạn BTC đóng đăng ký.</p>"
            "<p><a href='{{ app_url }}/register'>Mở form đăng ký</a></p>"
        ),
    },
    "account_welcome": {
        "subject": "Tài khoản cổng Team Building",
        "body_html": (
            "<p>Chào {{ full_name }},</p>"
            "<p>BTC đã tạo tài khoản cổng nội bộ cho bạn.</p>"
            "<ul>"
            "<li>Email đăng nhập: {{ email }}</li>"
            "<li>Mật khẩu tạm: <b>{{ temporary_password }}</b></li>"
            "</ul>"
            "<p>Đổi mật khẩu ngay lần đăng nhập đầu.</p>"
            "<p><a href='{{ app_url }}/login'>Đăng nhập</a></p>"
        ),
    },
}

TEMPLATE_DESCRIPTIONS = {
    "registration_confirmed": "Gửi khi CBNV gửi đăng ký",
    "info_published": "Gửi khi BTC công bố hành trình",
    "flight_changed": "Gửi khi BTC đổi chuyến bay của CBNV",
    "bus_changed": "Gửi khi BTC đổi xe của CBNV",
    "schedule_changed": "Gửi khi BTC sửa lịch trình (sau khi đã công bố)",
    "registration_reminder": "Gửi khi BTC nhắc CBNV chưa gửi đăng ký",
    "account_welcome": "Gửi khi BTC tạo CBNV mới và chọn gửi email kích hoạt",
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
    # Test-send from the editor: already-rendered HTML in the payload, so BTC
    # can mail unsaved edits without changing the live template.
    rendered_subject = context.get("_rendered_subject")
    rendered_html = context.get("_rendered_html")
    if isinstance(rendered_subject, str) and isinstance(rendered_html, str):
        return rendered_subject, rendered_html
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


async def build_email_context(db: AsyncSession, event: Event, employee: Employee) -> dict:
    """Context for templates fired once an event is already published —
    reuses the same live journey data (`journey_service.build_journey`) the
    CBNV portal itself shows, instead of a hand-picked payload dict frozen
    at the moment BTC made one specific change (previously flight_changed/
    bus_changed/info_published carried only full_name+event_name+app_url —
    no flight code, no bus, nothing; see docs/REBUILD-PLAN.md §R7 E4).
    `journey.model_dump(mode="json")` so the JSON outbox column and Jinja
    both get plain dicts/strings, not a Pydantic model. Never used for
    registration_confirmed — that fires before any journey exists."""
    from app.services.journey_service import (
        build_journey,  # local: avoid a service-module import cycle
    )

    journey = await build_journey(db, event, employee)
    return {
        "full_name": employee.full_name,
        "event_name": event.name,
        "app_url": _settings.app_base_url,
        "journey": journey.model_dump(mode="json"),
    }


async def notify_employees(
    db: AsyncSession,
    queue: ArqRedis,
    event: Event,
    employee_ids: list[int],
    template_code: str,
    dedupe_suffix: str,
) -> None:
    """Fan-out to a specific set of employees (not "everyone participating" —
    that's send_bulk_emails_task) with journey-derived context. Replaces the
    enqueue-then-commit-then-dispatch block that used to be copy-pasted
    between flights.py's and buses.py's adjust/PATCH endpoints."""
    result = await db.execute(select(Employee).where(Employee.id.in_(employee_ids)))
    employees = result.scalars().all()
    outbox_ids: list[int | None] = []
    for employee in employees:
        context = await build_email_context(db, event, employee)
        outbox_id = await enqueue_email(
            db, event_id=event.id, to_email=employee.email, template_code=template_code,
            payload=context, dedupe_key=f"{template_code}:{event.id}:{employee.id}:{dedupe_suffix}",
        )
        outbox_ids.append(outbox_id)
    await db.commit()
    # dispatch only after commit — see enqueue_email's docstring
    await dispatch_emails(queue, [oid for oid in outbox_ids if oid is not None])


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


async def restore_default_template(db: AsyncSession, event_id: int, code: str) -> dict:
    if code not in DEFAULT_TEMPLATES:
        raise AppError("unknown_template", f"Không có mẫu email '{code}'", http_status.HTTP_400_BAD_REQUEST)
    result = await db.execute(
        select(EmailTemplate).where(EmailTemplate.code == code, EmailTemplate.event_id == event_id)
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.flush()
    default = DEFAULT_TEMPLATES[code]
    return {
        "code": code,
        "subject": default["subject"],
        "body_html": default["body_html"],
        "description": TEMPLATE_DESCRIPTIONS.get(code),
        "is_custom": False,
    }


PREVIEW_CONTEXT = {
    "full_name": "Nguyễn Văn A",
    "event_name": "Team Building 2026",
    "team_name": "Engineering",
    "participating_label": "Có tham gia",
    "shift_name": "Ca 1",
    "transport_summary": "2 chặng",
    "app_url": "https://teambuilding.example.com",
    # shaped like journey.model_dump(mode="json") in build_email_context —
    # every field a real flight_changed/bus_changed/info_published render
    # could touch, so the preview actually shows what BTC will send
    "journey": {
        "flights": [
            {
                "direction": "outbound", "flight_code": "VN1825", "airline": "Vietnam Airlines",
                "depart_at": "2026-12-20 06:00", "arrive_at": "2026-12-20 07:20",
                "origin": "Sân bay Nội Bài (HAN)", "destination": "Sân bay Đà Nẵng (DAD)",
            }
        ],
        "buses": [
            {
                "leg_name": "Nhà/Văn phòng → Sân bay", "bus_code": "XE-03", "bus_name": None,
                "gather_at": "2026-12-20 04:00", "depart_at": "2026-12-20 04:15",
                "destination": "Sân bay Nội Bài", "pickup_name": "Toà nhà A - Cầu Giấy",
                "pickup_address": None, "leader_name": "Nguyễn Văn Tài", "leader_phone": "0911111111",
                "note": None,
            }
        ],
        "room": {
            "hotel_name": "Danang Beach Resort", "hotel_address": "36 Võ Nguyên Giáp, Đà Nẵng",
            "room_number": "101", "checkin_date": "2026-12-20", "checkout_date": "2026-12-22",
        },
        "gala": {"status": "finished", "name": "Gala Dinner", "tables": [{"table_code": "B08", "table_name": "Bàn 08", "seats": []}]},
    },
}


def preview_template(subject: str, body_html: str) -> tuple[str, str]:
    """Renders arbitrary (possibly unsaved) subject/body against sample data —
    lets BTC see the effect of an edit before saving it, unlike rendering the
    persisted template which would ignore whatever they just typed."""
    return Template(subject).render(**PREVIEW_CONTEXT), Template(body_html).render(**PREVIEW_CONTEXT)


async def enqueue_schedule_changed(queue, event, item_id: int) -> None:
    if event.status.value not in PUBLISHED_STATUSES:
        return
    suffix = f"item{item_id}:{utcnow().strftime('%Y%m%d%H')}"
    await queue.enqueue_job("send_bulk_emails_task", event.id, "schedule_changed", suffix)
