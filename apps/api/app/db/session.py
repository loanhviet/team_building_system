from collections.abc import AsyncGenerator

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool if "sqlite" in settings.database_url else None,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:
    if "sqlite" not in settings.database_url:
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    from app.services.rag.fts import ensure_fts_sync

    ensure_fts_sync(cursor)
    cursor.close()


AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def lock_sqlite_write_transaction(session: AsyncSession) -> None:
    """Acquire SQLite's database-wide write lock before a capacity check.

    `SELECT ... FOR UPDATE` protects the same paths on PostgreSQL, but SQLite
    ignores it. `BEGIN IMMEDIATE` makes concurrent requests wait before they
    read occupancy, so the second request sees the first committed assignment.
    Call this before any query in a capacity-sensitive request.
    """
    bind = session.get_bind()
    if bind.dialect.name == "sqlite":
        await session.execute(text("BEGIN IMMEDIATE"))


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
