import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.hotel import Hotel
from app.models.organization import Employee
from app.models.rag import RagDocument
from app.models.registration import Registration
from app.models.schedule import Announcement, ScheduleItem
from app.services.event_service import get_setting
from app.services.journey_service import PUBLISHED_STATUSES, build_journey


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


async def _upsert_document(
    db: AsyncSession, event_id: int, source_type: str, source_id: str, title: str,
    content: str, scope: str, scope_ref_id: int | None,
) -> tuple[RagDocument, bool]:
    """Returns (document, changed). changed=False means the checksum is
    unchanged since last index — the caller should skip re-embedding it."""
    checksum = _checksum(content)
    result = await db.execute(
        select(RagDocument).where(
            RagDocument.event_id == event_id, RagDocument.source_type == source_type,
            RagDocument.source_id == source_id,
        )
    )
    doc = result.scalar_one_or_none()
    if doc is not None and doc.checksum == checksum:
        return doc, False

    if doc is None:
        doc = RagDocument(event_id=event_id, source_type=source_type, source_id=source_id)
        db.add(doc)
    doc.title = title
    doc.content = content
    doc.checksum = checksum
    doc.scope = scope
    doc.scope_ref_id = scope_ref_id
    await db.flush()
    return doc, True


async def build_event_documents(db: AsyncSession, event_id: int) -> list[tuple[RagDocument, bool]]:
    """(Re)computes every rag_document for an event from its current source
    data. Cheap to call repeatedly — unchanged content is detected by
    checksum and reported as changed=False so the caller skips re-embedding."""
    event = await db.get(Event, event_id)
    changed_docs: list[tuple[RagDocument, bool]] = []

    result = await db.execute(
        select(ScheduleItem).where(
            ScheduleItem.event_id == event_id, ScheduleItem.is_published.is_(True)
        )
    )
    for item in result.scalars().all():
        content = f"Lịch trình: {item.title}."
        if item.location:
            content += f" Địa điểm: {item.location}."
        if item.start_at:
            content += f" Thời gian: {item.start_at.isoformat()}."
        if item.description:
            content += f" {item.description}"
        changed_docs.append(
            await _upsert_document(
                db, event_id, "schedule_item", str(item.id), item.title, content, "public", None
            )
        )

    result = await db.execute(
        select(Announcement).where(
            Announcement.event_id == event_id, Announcement.published_at.is_not(None)
        )
    )
    for a in result.scalars().all():
        content = f"Thông báo: {a.title}. {a.body_md}"
        changed_docs.append(
            await _upsert_document(
                db, event_id, "announcement", str(a.id), a.title, content, "public", None
            )
        )

    terms_text = await get_setting(db, event_id, "terms_text", "")
    if terms_text:
        changed_docs.append(
            await _upsert_document(
                db, event_id, "terms", "terms", "Quy định chương trình", terms_text, "public", None
            )
        )

    result = await db.execute(select(Hotel).where(Hotel.event_id == event_id))
    for hotel in result.scalars().all():
        content = f"Khách sạn {hotel.name}."
        if hotel.address:
            content += f" Địa chỉ: {hotel.address}."
        changed_docs.append(
            await _upsert_document(
                db, event_id, "hotel", str(hotel.id), hotel.name, content, "public", None
            )
        )

    if event is not None and event.status.value in PUBLISHED_STATUSES:
        result = await db.execute(
            select(Employee)
            .join(Registration, Registration.employee_id == Employee.id)
            .where(
                Registration.event_id == event_id, Registration.status == "submitted",
                Registration.is_participating.is_(True),
            )
        )
        for employee in result.scalars().all():
            journey = await build_journey(db, event, employee)
            lines = [f"Hành trình cá nhân của {journey.full_name} (Team {journey.team_name or '—'}):"]
            for f in journey.flights:
                direction_label = "đi" if f.direction == "outbound" else "về"
                line = f"Chuyến bay {direction_label}: {f.flight_code}"
                if f.depart_at:
                    line += f", khởi hành lúc {f.depart_at.isoformat()}"
                if f.origin and f.destination:
                    line += f", từ {f.origin} đến {f.destination}"
                lines.append(line)
            for b in journey.buses:
                line = f"Xe chặng {b.leg_name}: xe {b.bus_code}"
                if b.gather_at:
                    line += f", tập trung lúc {b.gather_at.isoformat()}"
                if b.leader_name:
                    line += f", Trưởng xe {b.leader_name} ({b.leader_phone or 'chưa có SĐT'})"
                lines.append(line)
            if journey.room:
                lines.append(f"Phòng ở: {journey.room.hotel_name}, phòng {journey.room.room_number}")
            content = "\n".join(lines)
            changed_docs.append(
                await _upsert_document(
                    db, event_id, "journey", str(employee.id),
                    f"Hành trình của {employee.full_name}", content, "employee", employee.id,
                )
            )

    return changed_docs
