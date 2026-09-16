#!/bin/sh
# API container start: migrate → (optional) demo seed → serve.
# Extra args pass through to uvicorn (dev override adds --reload).
set -e

if [ "${APP_ENV:-dev}" != "dev" ] && [ "${SEED_DEMO:-0}" = "1" ]; then
  echo "Refusing to start a non-development environment with SEED_DEMO=1" >&2
  exit 1
fi

alembic upgrade head

# Seed is idempotent (skips when admin@teambuilding.vn exists), so a fresh
# clone gets one login account per role with no manual step — no event, no
# flights/buses/Gala pre-built; set those up through the admin UI like a real
# BTC would. Set SEED_DEMO=0 for a real deployment — the seeded accounts have
# known passwords. For a fully populated demo event instead, seed manually:
# `docker compose exec api python -m app.db.seed --full`.
if [ "${SEED_DEMO:-1}" = "1" ]; then
  python -m app.db.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"
