from app.models.rag import KnowledgeDocument
from app.worker.settings import enqueue_missing_rag_indexes
from app.worker.supervisor import supervise
from tests.conftest import FakeQueue


async def test_worker_queues_missing_faq_index(db_session, world):
    db_session.add(KnowledgeDocument(
        event_id=world.event.id, title="FAQ", body_md="Nội dung", is_published=True,
    ))
    await db_session.flush()
    queue = FakeQueue()
    await enqueue_missing_rag_indexes(db_session, queue)
    assert queue.jobs == [("reindex_rag_task", (world.event.id,), {})]


async def test_supervisor_observes_async_process_exit(monkeypatch):
    class Child:
        returncode = None

    class Redis:
        async def get(self, _key):
            return None

        async def aclose(self):
            return None

    child = Child()

    async def spawn(*_args):
        return child

    async def tick(_seconds):
        child.returncode = 0

    monkeypatch.setattr("app.worker.supervisor.asyncio.create_subprocess_exec", spawn)
    monkeypatch.setattr("app.worker.supervisor.asyncio.sleep", tick)
    monkeypatch.setattr("app.worker.supervisor.Redis.from_url", lambda *_a, **_k: Redis())
    assert await supervise() == 0
