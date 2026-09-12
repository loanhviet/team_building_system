# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

**`docs/REBUILD-PLAN.md` is the current source of truth.** Phases 0–13 (recorded in `docs/PLAN.md`)
shipped a backend and data model that match `docs/BRD.md` closely, but a full audit against the running
system (2026-09-12) found the UI layer, demo data, and several BRD-required fields fell short — because
none of those 13 phases were ever click-tested in a real browser, only verified with `curl`/`ruff`/`tsc`.
`docs/REBUILD-PLAN.md` is a rebuild pass (phases **R0–R6**) that fixes this: real seed data, root-cause
backend fixes, a shared component layer, then the CBNV portal, Gala, and Admin workspace redone with
actual browser verification. **Read it, find the current R-phase, and follow its checklist** before
touching anything else. `docs/PLAN.md` stays as the historical record of Phase 0–13 — still the right
place to look up the original architecture, data model, and algorithm design.

`docs/BRD.md` is the original business requirements doc (converted from the source `.docx`), in Vietnamese.

## Rules learned from the R0–R6 audit — don't repeat these

- **Never mark a phase/checklist item done without opening it in a real browser.** This is the single
  root cause behind the entire rebuild: 13 phases all passed `ruff`/`pytest`/`tsc`/`curl` and were still
  broken to actually use. `curl 200` proves the route exists, not that the feature works.
- **Fix at the shared function, never at each caller.** Example of what went wrong:
  `services/master_data.py`'s generic `update()` had `if value is not None: setattr(...)`, which silently
  broke every PATCH endpoint in the app from clearing an optional field — one bug, ~15 routes. If you find
  a bug in a shared helper, grep every caller before deciding the fix is caller-local.
- **Every displayed label goes through `apps/web/src/lib/labels.ts`.** Don't render enum values
  (`outbound`, `auto`, `shift_mismatch`, job `type`/`status`, audit `action`/`entity_type`, Gala
  `status`) straight into JSX — that's how English/internal strings ended up in a Vietnamese UI across a
  dozen admin screens.
- **Every admin list uses `components/domain/data-table.tsx`** (sort + search + filter + export)
  rather than a bespoke table per screen — BRD §10 requires search/filter/sort/export on every list, and
  building it once per screen is how 9 of 11 admin lists ended up with none of it.
- **Any destructive action or one that mass-emails employees needs `components/domain/confirm-dialog.tsx`.**
  Publishing an event's info, transitioning event status, deactivating master data, drawing Gala order,
  changing a user's role — none of these had a confirmation, and `information_published` fires a
  company-wide email on a single unconfirmed click.
- **Don't add a backend endpoint without a frontend caller, or vice versa.** The audit found ~10 REST
  endpoints (bus/hotel/room PATCH, allocation history, announcement edit) with full backend support and
  zero UI — features that exist in the API and are invisible to BTC. If you add one, wire it up in the
  same phase.
- **`GET` endpoints are not automatically safe to leave unauthenticated or unfiltered.** Two real leaks
  found: `GET /employees` (whole staff directory) was open to any logged-in role instead of admin-only,
  and `/schedule-items`/`/announcements` returned unpublished drafts to employees. Re-check role scoping
  and publish-status filtering on every new read endpoint, not just writes.

## Commands

All commands assume the stack is running via Docker (`make up`); there is no local venv/node_modules setup
documented — services run inside containers.

```bash
make up              # docker compose up -d --build (api, worker, web, redis; +mailhog in dev override)
make down             # stop everything
make logs s=worker     # tail logs for one service (s=api|worker|web|redis)
make migrate           # alembic upgrade head (inside api container)
make migration m="add users table"   # alembic revision --autogenerate -m "..."
make seed              # docker compose exec api python -m app.db.seed
make test               # pytest in api container + npm test in web container
make lint                # ruff check . (api) + npm run lint (web)
make sh-api / make sh-web   # shell into a running container
```

Run a single pytest test: `docker compose exec api pytest tests/path/to/test_file.py::test_name`.
Run ruff with autofix: `docker compose exec api ruff check . --fix`.

**Note on `make test`:** `apps/web/package.json` has no `test` script, so `npm test --if-present` is a
silent no-op for the web side today — `make test` only actually runs the API's pytest suite. There is no
frontend test suite; browser verification (see "Start here") is how the web side gets checked.

**Note on `make seed`:** implemented (`apps/api/app/db/seed.py`), but as of the R0-R6 rebuild it is being
rewritten to produce complete, realistic data (flights with real times/airports, all 4 transport legs,
pickup points, a fully-seated Gala floor plan, a published event) instead of the previous skeletal
smoke-test data — see `docs/REBUILD-PLAN.md` §R0 before relying on its output.

`docker-compose.override.yml` is picked up automatically by plain `docker compose` commands and switches
everything to dev mode (bind-mounted source, `uvicorn --reload`, `next dev` with Turbopack, `arq --watch`,
plus a MailHog container on `:8025` that catches all outgoing email instead of sending it).

Qdrant (for the RAG chat feature, Phase 8) is gated behind the `rag` compose profile and is not started by
plain `make up`: `docker compose --profile rag up -d`. **The chat/RAG feature is intentionally frozen** —
it isn't in the original BRD, and the plan is to redesign it later against the ragflow project rather than
extend it now. Don't invest UI/UX effort there during the R0–R6 rebuild; small label/color consistency
fixes are fine.

**Gotcha:** Compose merges `profiles:` lists as a union, not an override — a service's `profiles` key
cannot be cleared from the override file. This is why MailHog is defined as a whole separate service block
in `docker-compose.override.yml` rather than as a `profiles: []` override on a base-file service.

## Architecture

### Stack
FastAPI (async, Python 3.12) + SQLAlchemy 2 async/aiosqlite + Alembic, behind Next.js 16 (App Router,
TypeScript, Tailwind, TanStack Query). SQLite (WAL mode) is the database — chosen deliberately over Postgres
for this project's scale, but the schema is kept portable. Redis + ARQ run background jobs; Redis also backs
distributed locking for Gala Dinner seat selection and pub/sub for its realtime updates. Qdrant is the
vector store for the frozen chat/RAG feature, behind a provider-agnostic LLM/embedding interface.

**Next.js 16 has breaking changes vs. what you may know as "Next.js."** Before writing frontend code, read
the relevant guide under `apps/web/node_modules/next/dist/docs/` (see `apps/web/AGENTS.md`).

### Code layout convention
`apps/api/app/routers/` (HTTP only) → `apps/api/app/services/` (business logic, framework-agnostic) →
`apps/api/app/models/` (SQLAlchemy). Routers must stay thin; all business logic belongs in services so the
ARQ worker can call it directly without going through HTTP. `apps/api/app/worker/tasks/` holds one file per
task group, registered in `apps/api/app/worker/settings.py`'s `WorkerSettings.functions` — **ARQ refuses to
start with zero registered functions**, hence the `ping` placeholder task, which stays registered even
though nothing enqueues it (don't delete it without adding a replacement).

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
`shifts` / `transport_legs` / `pickup_points` / `event_settings` and are configured per event by an admin,
not hardcoded. This part of the system audits clean — see `docs/PLAN.md` §5 for the full schema and §7 for
the allocation algorithm design before adding or changing models. (The allocation *weights* are
config-driven correctly; whether every weight is actually read by the scoring function is a separate
question — see `docs/REBUILD-PLAN.md` §3.2 for a case where it wasn't.)

### Auth & permissions
Four roles: `employee`, `team_leader`, `organizer` (BTC), `super_admin`. Permission checks belong in FastAPI
dependencies on the backend — the frontend only hides UI, it never gates access. See `docs/PLAN.md` §8.
Don't assume an existing endpoint's role dependency is correct just because it exists — see the `GET
/employees` leak noted above.

### Error handling contract
All API errors go through the handlers registered in `app/core/errors.py`, returning a consistent
`{"error": {"code", "message", "details"}}` body — extend `AppError` subclasses/usages rather than raising
raw `HTTPException` for new business-rule errors. An unhandled `IntegrityError` (e.g. a bad foreign key
from an unvalidated ID) falls through to a generic 500 — validate IDs belong to the right event *before*
the insert, and raise `AppError` yourself, rather than relying on the DB constraint to produce a good
error message.
