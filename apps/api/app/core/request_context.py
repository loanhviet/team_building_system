"""Per-request context available without threading it through every function
signature. Currently just the client IP, read by `audit_service.record_audit`
so ~20 call sites across the routers don't each need a `request: Request`
parameter just to log who did what from where."""

from contextvars import ContextVar

_client_ip: ContextVar[str | None] = ContextVar("_client_ip", default=None)


def set_client_ip(ip: str | None) -> None:
    _client_ip.set(ip)


def get_client_ip() -> str | None:
    return _client_ip.get()
