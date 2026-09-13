#!/bin/sh
# API container start: migrate → (optional) demo seed → serve.
# Extra args pass through to uvicorn (dev override adds --reload).
set -e

alembic upgrade head

# Seed is idempotent (skips when admin@teambuilding.vn exists), so a fresh
# clone gets login accounts + demo events with no manual step. Set SEED_DEMO=0
# for a real deployment — the demo accounts have known passwords.
if [ "${SEED_DEMO:-1}" = "1" ]; then
  python -m app.db.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"
