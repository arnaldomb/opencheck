.PHONY: dev prod stop logs migrate seed traefik-setup

# ── Desenvolvimento ──────────────────────────────────────────────────────────
dev:
	docker compose up -d
	pnpm install
	pnpm db:generate
	pnpm db:migrate
	pnpm db:seed
	pnpm dev

infra-up:
	docker compose up -d

infra-down:
	docker compose down

# ── Produção ──────────────────────────────────────────────────────────────────
prod:
	docker compose -f docker-compose.prod.yml up -d

prod-build:
	docker compose -f docker-compose.prod.yml build --no-cache

prod-down:
	docker compose -f docker-compose.prod.yml down

# Criar a rede externa que o Traefik usa
traefik-network:
	docker network create proxy 2>/dev/null || true

# Setup inicial de produção (rodar uma vez)
traefik-setup: traefik-network
	touch traefik/dynamic/acme.json || true
	chmod 600 traefik/dynamic/acme.json || true
	docker compose -f docker-compose.prod.yml up -d traefik

# ── Database ──────────────────────────────────────────────────────────────────
migrate:
	pnpm db:migrate

seed:
	pnpm db:seed

studio:
	pnpm db:studio

# ── Logs ──────────────────────────────────────────────────────────────────────
logs:
	docker compose logs -f

logs-api:
	docker compose -f docker-compose.prod.yml logs -f api

logs-web:
	docker compose -f docker-compose.prod.yml logs -f web
