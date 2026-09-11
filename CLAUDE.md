# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

**`docs/PLAN.md` is the single source of truth for this project.** It contains the full architecture,
data model, phased roadmap, and a checklist per phase. Before doing any non-trivial work: read it, find
the current phase, and update its checkboxes + "Đã kiểm chứng" notes when a phase is completed (mark `[x]`,
note any deviation from the original plan — see the Phase 0 entry for the expected format).

`docs/BRD.md` is the original business requirements doc (converted from the source `.docx`), in Vietnamese.
`docs/PLAN.md` records where the implementation intentionally deviates from it (e.g. no SSO — email+password
auth instead, since there's no company SSO infra to integrate with).

This is a from-scratch build (started 2026-09-11). As of now, only **Phase 0** (repo/Docker scaffolding) is
done — most of `apps/api/app/{models,schemas,routers,services}` and all of `apps/web/src` beyond the health
check page are still empty or unbuilt. Don't assume functionality exists just because a directory does.

## Commands

All commands assume the stack is running via Docker (`make up`); there is no local venv/node_modules setup
documented — services run inside containers.

```bash
make up              # docker compose up -d --build (api, worker, web, redis; +mailhog in dev override)
make down             # stop everything
make logs s=worker     # tail logs for one service (s=api|worker|web|redis)
make migrate           # alembic upgrade head (inside api container)
make migration m="add users table"   # alembic revision --autogenerate -m "..."
make seed              # python -m app.db.seed (not yet implemented)
make test               # pytest in api container + npm test in web container
make lint                # ruff check . (api) + npm run lint (web)
make sh-api / make sh-web   # shell into a running container
```

Run a single pytest test: `docker compose exec api pytest tests/path/to/test_file.py::test_name`.
Run ruff with autofix: `docker compose exec api ruff check . --fix`.

`docker-compose.override.yml` is picked up automatically by plain `docker compose` commands and switches
everything to dev mode (bind-mounted source, `uvicorn --reload`, `next dev` with Turbopack, `arq --watch`,
plus a MailHog container on `:8025` that catches all outgoing email instead of sending it).

Qdrant (for the RAG chat feature, Phase 8) is gated behind the `rag` compose profile and is not started by
plain `make up`: `docker compose --profile rag up -d`.

**Gotcha:** Compose merges `profiles:` lists as a union, not an override — a service's `profiles` key
cannot be cleared from the override file. This is why MailHog is defined as a whole separate service block
in `docker-compose.override.yml` rather than as a `profiles: []` override on a base-file service.

## Architecture

### Stack
FastAPI (async, Python 3.12) + SQLAlchemy 2 async/aiosqlite + Alembic, behind Next.js 16 (App Router,
TypeScript, Tailwind, TanStack Query). SQLite (WAL mode) is the database — chosen deliberately over Postgres
for this project's scale, but the schema is kept portable. Redis + ARQ run background jobs; Redis also backs
distributed locking for Gala Dinner seat selection (Phase 7) and pub/sub for its realtime updates. Qdrant is
the vector store for the RAG chat feature (Phase 8, built last, behind a provider-agnostic LLM/embedding
interface — not tied to a specific vendor).

### Code layout convention
`apps/api/app/routers/` (HTTP only) → `apps/api/app/services/` (business logic, framework-agnostic) →
`apps/api/app/models/` (SQLAlchemy). Routers must stay thin; all business logic belongs in services so the
ARQ worker can call it directly without going through HTTP. `apps/api/app/worker/tasks/` holds one file per
task group, registered in `apps/api/app/worker/settings.py`'s `WorkerSettings.functions` — **ARQ refuses to
start with zero registered functions**, hence the `ping` placeholder task that must be replaced/extended as
real tasks land (starting with `send_email` in Phase 2).

### The must-follow rule: never block the request thread
Per `docs/PLAN.md` §6, no API endpoint may run a task longer than ~1s inline. Long-running work (flight/bus
allocation, bulk email, Excel import/export, RAG re-indexing) is always enqueued to ARQ and returns
`202 {job_id}`; progress is tracked in a `jobs` DB table (not just Redis, which only holds ARQ's own
short-TTL result) and polled via `GET /api/jobs/{id}`.

### SQLite has one writer — respect it
`app/db/session.py` sets `PRAGMA journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`,
`foreign_keys=ON` on every connection. Both the `api` and `worker` containers write to the same bind-mounted
`./data/teambuilding.db`. Long-running worker tasks must commit in short batches (plan says ~500 rows) rather
than holding one transaction for the whole job, or the API will stall on writes.

### Multi-event, config-driven data model
Every business table carries an `event_id` — the system manages multiple Team Building events, not just one.
The BRD explicitly forbids hardcoding shift counts, teams, capacities, etc.; these all live in
`shifts` / `transport_legs` / `event_settings` and are configured per event by an admin, not hardcoded.
See `docs/PLAN.md` §5 for the full schema and §7 for the allocation algorithm design (greedy with
config-driven weights, not a hardcoded priority order) before adding or changing models.

### Auth & permissions
Four roles: `employee`, `team_leader`, `organizer` (BTC), `super_admin`. Permission checks belong in FastAPI
dependencies on the backend — the frontend only hides UI, it never gates access. See `docs/PLAN.md` §8.

### Error handling contract
All API errors go through the handlers registered in `app/core/errors.py`, returning a consistent
`{"error": {"code", "message", "details"}}` body — extend `AppError` subclasses/usages rather than raising
raw `HTTPException` for new business-rule errors.
