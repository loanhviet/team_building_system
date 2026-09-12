from sqlalchemy import select

from app.db.knowledge_pack import KNOWLEDGE_FAQS, TERMS_TEXT
from app.db.seed import seed_knowledge
from app.models.rag import KnowledgeDocument
from app.services.event_service import get_setting
from app.services.rag.ingest import build_event_documents

REQUIRED_TOPICS = [
    "Trợ lý hỏi đáp trả lời được gì",
    "Cách đăng ký và hạn chỉnh sửa",
    "Ca bay là nguyện vọng, không phải chỗ đã giữ",
    "Đăng ký xe 4 chặng và điểm đón",
    "Chính sách huỷ đăng ký và phí phạt",
    "Khi nào xem được hành trình",
    "Gala Dinner: bốc thăm, lượt chọn ghế, quota",
    "Trang phục và lịch trình Gala",
    "Mang theo gì",
    "Người nhà và khách mời",
    "Liên hệ khẩn và kênh BTC",
]


def test_pack_covers_concierge_topics():
    titles = [title for title, _ in KNOWLEDGE_FAQS]
    assert len(titles) == len(set(titles))
    for topic in REQUIRED_TOPICS:
        assert topic in titles
    assert "nguyện vọng" in TERMS_TEXT
    assert "phí phạt" in TERMS_TEXT
    assert "smart casual" in "".join(body for _, body in KNOWLEDGE_FAQS).lower()


async def test_seed_knowledge_upserts_and_unpublishes_stale(db_session, world):
    db_session.add(
        KnowledgeDocument(
            event_id=world.event.id,
            title="Dress code Gala",
            body_md="old",
            is_published=True,
            checksum="old",
        )
    )
    await db_session.commit()

    await seed_knowledge(db_session, world.event)
    await db_session.commit()

    terms = await get_setting(db_session, world.event.id, "terms_text", "")
    assert "Ca bay là nguyện vọng" in terms or "nguyện vọng" in terms

    rows = (
        await db_session.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.event_id == world.event.id)
        )
    ).scalars().all()
    by_title = {d.title: d for d in rows}
    assert by_title["Dress code Gala"].is_published is False
    assert by_title["Trang phục và lịch trình Gala"].is_published is True

    docs = await build_event_documents(db_session, world.event.id)
    faq_titles = {d.title for d, _ in docs if d.source_type == "faq"}
    assert "Trang phục và lịch trình Gala" in faq_titles
    assert "Dress code Gala" not in faq_titles
