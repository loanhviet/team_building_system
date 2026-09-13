from sqlalchemy import select

from app.db.knowledge_pack import KNOWLEDGE_FAQS
from app.db.seed import seed_knowledge
from app.models.rag import KnowledgeDocument
from app.services.event_service import get_setting, upsert_setting


async def test_seed_knowledge_fills_empty_event(db_session, world):
    """Fresh event, nothing configured yet — seed fills in the demo pack so
    there's something to test the concierge against."""
    await seed_knowledge(db_session, world.event)
    await db_session.commit()

    terms = await get_setting(db_session, world.event.id, "terms_text", None)
    assert terms is not None

    rows = (
        await db_session.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.event_id == world.event.id)
        )
    ).scalars().all()
    assert len(rows) == len(KNOWLEDGE_FAQS)
    assert all(r.is_published for r in rows)


async def test_seed_knowledge_never_overwrites_real_content(db_session, world):
    """A real event's own terms + FAQ (typed by BTC, or copied from a prior
    kỳ) must survive re-running the seed — this is what makes seed_knowledge
    idempotent-safe to run against a live event, unlike the old upsert-by-title
    behaviour that clobbered BTC edits back to the demo wording."""
    await upsert_setting(db_session, world.event.id, "terms_text", "Quy định thật của BTC.")
    db_session.add(
        KnowledgeDocument(
            event_id=world.event.id, title="Dress code Gala", body_md="Áo dài truyền thống.",
            is_published=True,
        )
    )
    await db_session.commit()

    await seed_knowledge(db_session, world.event)
    await db_session.commit()

    terms = await get_setting(db_session, world.event.id, "terms_text", None)
    assert terms == "Quy định thật của BTC."

    rows = (
        await db_session.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.event_id == world.event.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].body_md == "Áo dài truyền thống."
