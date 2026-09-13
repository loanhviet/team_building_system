"""Shared fixtures for route-level (HTTP) tests. Each test gets a fresh
in-memory SQLite DB (StaticPool keeps one connection alive for the whole
engine, so every session drawn from it sees the same data) and an httpx
AsyncClient wired to the real FastAPI app via ASGI transport — no server
process, no real Redis/worker needed (get_queue is swapped for a stub that
just records calls instead of touching Redis)."""

from collections.abc import AsyncGenerator
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.queue import get_queue
from app.core.security import create_access_token, hash_password
from app.core.time import utcnow
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.auth import User
from app.models.enums import EventStatus, UserRole
from app.models.event import Event, Shift
from app.models.organization import Employee, Site, Team
from app.models.registration import Registration


class FakeQueue:
    """Stands in for the ArqRedis pool in tests: records what would have been
    enqueued/published instead of touching Redis or a real worker."""

    def __init__(self) -> None:
        self.jobs: list[tuple[str, tuple, dict]] = []
        self._kv: dict[str, int] = {}

    async def enqueue_job(self, name: str, *args, **kwargs):
        self.jobs.append((name, args, kwargs))
        return SimpleNamespace(job_id=f"fake-{len(self.jobs)}")

    async def publish(self, channel: str, message) -> None:
        return None

    async def incr(self, key: str) -> int:
        self._kv[key] = int(self._kv.get(key, 0)) + 1
        return self._kv[key]

    async def expire(self, key: str, seconds: int) -> bool:
        return True


@pytest_asyncio.fixture
async def test_engine():
    import app.models  # noqa: F401  populate Base.metadata with every table

    engine = create_async_engine(
        "sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )

    from sqlalchemy import event as sa_event

    @sa_event.listens_for(engine.sync_engine, "connect")
    def _fk_on(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        from sqlalchemy import text as sa_text

        from app.services.rag.fts import FTS_DDL

        await conn.execute(sa_text(FTS_DDL))

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(test_engine) -> AsyncGenerator[AsyncClient, None]:
    factory = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            yield session

    fake_queue = FakeQueue()
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_queue] = lambda: fake_queue

    from app.routers import chat as chat_router

    chat_router.AsyncSessionLocal = factory

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        ac.fake_queue = fake_queue  # type: ignore[attr-defined]
        yield ac

    from app.db.session import AsyncSessionLocal as real_factory

    chat_router.AsyncSessionLocal = real_factory
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    def _make(user: User) -> dict[str, str]:
        token = create_access_token(user_id=user.id, role=user.role.value)
        return {"Authorization": f"Bearer {token}"}

    return _make


async def make_employee(
    db_session: AsyncSession, *, team: Team, site: Site, code: str, role: UserRole = UserRole.employee
) -> SimpleNamespace:
    """Creates one Employee + its User account, flushed but not committed —
    caller commits once the rest of the scenario is set up."""
    employee = Employee(
        employee_code=code, full_name=f"Nhan vien {code}", email=f"{code.lower()}@test.vn",
        team_id=team.id, site_id=site.id,
    )
    db_session.add(employee)
    await db_session.flush()
    user = User(
        employee_id=employee.id, email=employee.email, password_hash=hash_password("x"), role=role
    )
    db_session.add(user)
    await db_session.flush()
    return SimpleNamespace(employee=employee, user=user)


@pytest_asyncio.fixture
async def world(db_session: AsyncSession) -> SimpleNamespace:
    """A minimal event with one site/team/shift and one submitted,
    participating registration — the common starting point most route tests
    build on."""
    site = Site(code="HN", name="Ha Noi")
    team = Team(code="ENG", name="Engineering")
    db_session.add_all([site, team])
    await db_session.flush()

    event = Event(
        code="TEST", name="Test Event", destination="Test City",
        status=EventStatus.registration_open,
    )
    db_session.add(event)
    await db_session.flush()

    shift = Shift(event_id=event.id, code="CA1", name="Ca 1", sort_order=1)
    db_session.add(shift)
    await db_session.flush()

    person = await make_employee(db_session, team=team, site=site, code="NV001")
    organizer = User(email="btc@test.vn", password_hash=hash_password("x"), role=UserRole.organizer)
    db_session.add(organizer)
    await db_session.flush()

    registration = Registration(
        event_id=event.id, employee_id=person.employee.id, status="submitted",
        is_participating=True, shift_id=shift.id, agreed_terms_at=utcnow(),
        terms_version="v1", submitted_at=utcnow(),
    )
    db_session.add(registration)
    await db_session.commit()

    return SimpleNamespace(
        site=site, team=team, event=event, shift=shift,
        employee=person.employee, employee_user=person.user,
        organizer_user=organizer, registration=registration,
    )
