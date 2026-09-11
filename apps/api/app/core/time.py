from datetime import UTC, datetime


def utcnow() -> datetime:
    """Naive UTC now — SQLite has no tz-aware storage, so the whole app standardizes
    on naive datetimes that are implicitly always UTC. Never mix in `datetime.now(UTC)`
    (aware) values; comparing aware vs. naive raises TypeError."""
    return datetime.now(UTC).replace(tzinfo=None)
