import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rag import KnowledgeDocument, RagDocument
from app.models.schedule import Announcement, ScheduleItem
from app.services.event_service import get_setting


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def schedule_document_content(item: ScheduleItem) -> str:
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
    return content


def announcement_document_content(item: Announcement) -> str:
    return f"Thông báo: {item.title}. {item.body_md}"


def faq_document_content(item: KnowledgeDocument) -> str:
    return f"{item.title}\n\n{item.body_md}"


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
    # Content changed (or brand new) — clear indexed_at so reindex knows this
    # document still needs (re-)embedding even if the Qdrant step of a
    # previous reindex failed partway through.
    doc.indexed_at = None
    await db.flush()
    return doc, True


async def build_event_documents(db: AsyncSession, event_id: int) -> list[tuple[RagDocument, bool]]:
    """(Re)computes public rag_documents for an event. Personal journeys are
    intentionally not indexed — those facts are served live via chat tools.
    Event overview / hotel are also not indexed — get_event_context and
    get_my_journey already serve that live and more accurately."""
    changed_docs: list[tuple[RagDocument, bool]] = []

    result = await db.execute(
        select(ScheduleItem).where(
            ScheduleItem.event_id == event_id,
            ScheduleItem.is_published.is_(True),
            ScheduleItem.audience == "all",
        )
    )
    for item in result.scalars().all():
        changed_docs.append(
            await _upsert_document(
                db, event_id, "schedule_item", str(item.id), item.title,
                schedule_document_content(item),
            )
        )

    result = await db.execute(
        select(Announcement).where(
            Announcement.event_id == event_id, Announcement.published_at.is_not(None)
        )
    )
    for a in result.scalars().all():
        changed_docs.append(
            await _upsert_document(
                db, event_id, "announcement", str(a.id), a.title,
                announcement_document_content(a),
            )
        )

    terms_text = await get_setting(db, event_id, "terms_text", "")
    if terms_text:
        changed_docs.append(
            await _upsert_document(
                db, event_id, "terms", "terms", "Quy định chương trình", str(terms_text),
            )
        )

    result = await db.execute(
        select(KnowledgeDocument).where(
            KnowledgeDocument.event_id == event_id,
            KnowledgeDocument.is_published.is_(True),
        )
    )
    for faq in result.scalars().all():
        changed_docs.append(
            await _upsert_document(
                db, event_id, "faq", str(faq.id), faq.title,
                faq_document_content(faq),
            )
        )

    return changed_docs
