import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.hotel import Hotel
from app.models.rag import KnowledgeDocument, RagDocument
from app.models.schedule import Announcement, ScheduleItem
from app.services.event_service import get_setting
from app.services.journey_service import PUBLISHED_STATUSES


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


async def _upsert_document(
    db: AsyncSession, event_id: int, source_type: str, source_id: str, title: str,
    content: str, scope: str = "public", scope_ref_id: int | None = None,
) -> tuple[RagDocument, bool]:
    """Returns (document, changed). changed=False means skip re-chunk/re-embed."""
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
    """(Re)computes public rag_documents for an event. Personal journeys are
    intentionally not indexed — those facts are served live via chat tools."""
    event = await db.get(Event, event_id)
    changed_docs: list[tuple[RagDocument, bool]] = []

    if event is not None:
        overview = f"Sự kiện {event.name}."
        if event.destination:
            overview += f" Điểm đến: {event.destination}."
        if event.start_date:
            overview += f" Bắt đầu: {event.start_date.isoformat()}."
        if event.end_date:
            overview += f" Kết thúc: {event.end_date.isoformat()}."
        if event.description:
            overview += f" {event.description}"
        changed_docs.append(
            await _upsert_document(
                db, event_id, "event", str(event.id), event.name, overview,
            )
        )

    result = await db.execute(
        select(ScheduleItem).where(
            ScheduleItem.event_id == event_id, ScheduleItem.is_published.is_(True)
        )
    )
    for item in result.scalars().all():
        content = f"Lịch trình: {item.title}."
        if item.day_date:
            content += f" Ngày: {item.day_date.isoformat()}."
        if item.location:
            content += f" Địa điểm: {item.location}."
        if item.start_at:
            content += f" Bắt đầu: {item.start_at.isoformat()}."
        if item.end_at:
            content += f" Kết thúc: {item.end_at.isoformat()}."
        if item.description:
            content += f" {item.description}"
        changed_docs.append(
            await _upsert_document(
                db, event_id, "schedule_item", str(item.id), item.title, content,
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
                db, event_id, "announcement", str(a.id), a.title, content,
            )
        )

    terms_text = await get_setting(db, event_id, "terms_text", "")
    if terms_text:
        changed_docs.append(
            await _upsert_document(
                db, event_id, "terms", "terms", "Quy định chương trình", str(terms_text),
            )
        )

    if event is not None and event.status.value in PUBLISHED_STATUSES:
        result = await db.execute(select(Hotel).where(Hotel.event_id == event_id))
        for hotel in result.scalars().all():
            content = f"Khách sạn {hotel.name}."
            if hotel.address:
                content += f" Địa chỉ: {hotel.address}."
            changed_docs.append(
                await _upsert_document(
                    db, event_id, "hotel", str(hotel.id), hotel.name, content,
                )
            )

    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.event_id == event_id,
            KnowledgeDocument.is_published.is_(True),
        )
    )
    for faq in result.scalars().all():
        content = f"{faq.title}\n\n{faq.body_md}"
        changed_docs.append(
            await _upsert_document(
                db, event_id, "faq", str(faq.id), faq.title, content,
            )
        )

    return changed_docs
