.PHONY: dev prod stop logs migrate seed traefik-setup vps-setup vps-deploy vps-logs vps-down

# ── Desenvolvimento ──────────────────────────────────────────────────────────
dev:
	docker compose -f docker-compose.dev.yml up -d
	pnpm install
	pnpm db:generate
	pnpm db:migrate
	pnpm db:seed
	pnpm dev

infra-up:
	docker compose -f docker-compose.dev.yml up -d

infra-down:
	docker compose -f docker-compose.dev.yml down

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

# ── VPS / Produção (docker-compose.yml) ───────────────────────────────────────
# Primeira vez no servidor:
#   git clone https://github.com/arnaldomb/opencheck.git /docker/opencheck
#   cd /docker/opencheck
#   cp .env.example .env && nano .env   # preencher valores reais
#   make vps-setup

vps-setup:
	docker network create proxy 2>/dev/null || true
	docker compose up -d

vps-deploy:
	git pull origin main
	docker compose pull
	docker compose up -d --remove-orphans

vps-down:
	docker compose down --remove-orphans

vps-logs:
	docker compose logs -f

vps-logs-api:
	docker compose logs -f api

vps-logs-web:
	docker compose logs -f web
