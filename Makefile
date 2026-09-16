.PHONY: up down build logs migrate seed seed-full test lint sh-api sh-web

COMPOSE = docker compose

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build

logs:
	$(COMPOSE) logs -f $(s)

migrate:
	$(COMPOSE) exec api alembic upgrade head

migration:
	$(COMPOSE) exec api alembic revision --autogenerate -m "$(m)"

seed:
	$(COMPOSE) exec api python -m app.db.seed

seed-full:
	$(COMPOSE) exec api python -m app.db.seed --full

test:
	$(COMPOSE) exec api pytest
	$(COMPOSE) exec web npm test --if-present

lint:
	$(COMPOSE) exec api ruff check .
	$(COMPOSE) exec web npm run lint

sh-api:
	$(COMPOSE) exec api sh

sh-web:
	$(COMPOSE) exec web sh
