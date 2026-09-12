from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import setup_logging
from app.core.queue import init_arq_pool
from app.core.request_context import set_client_ip
from app.core.ws_manager import gala_manager
from app.routers import (
    auth,
    buses,
    chat,
    dashboard,
    email_templates,
    employees,
    event_config,
    events,
    flights,
    gala,
    health,
    hotels,
    jobs,
    journey,
    ops,
    rag,
    registrations,
    room_assignments,
    schedule,
    sites,
    teams,
    users,
)

setup_logging()

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    app.state.arq_pool = await init_arq_pool()
    await gala_manager.start_redis_listener(app.state.arq_pool)
    yield
    await gala_manager.stop_redis_listener()
    await app.state.arq_pool.close()


app = FastAPI(title="Team Building API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def capture_client_ip(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    set_client_ip(request.client.host if request.client else None)
    return await call_next(request)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(sites.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(event_config.router, prefix="/api")
app.include_router(employees.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(registrations.router, prefix="/api")
app.include_router(flights.router, prefix="/api")
app.include_router(hotels.router, prefix="/api")
app.include_router(room_assignments.router, prefix="/api")
app.include_router(buses.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(email_templates.router, prefix="/api")
app.include_router(journey.router, prefix="/api")
app.include_router(gala.router, prefix="/api")
app.include_router(rag.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(ops.router, prefix="/api")
