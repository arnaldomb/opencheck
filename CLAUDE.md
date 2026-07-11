# OpenCheck — CLAUDE.md

## Visão Geral do Projeto

SaaS B2B multi-tenant para gestão de vigilância patrimonial. Empresas de segurança contratam planos com N pontos (portarias/guaritas); cada ponto opera ciclos de alerta cronometrados com check-in do vigilante.

Cada tenant pode possuir: múltiplos operadores, supervisores, pontos operacionais, ciclos de monitoramento e dispositivos integrados.

O sistema deve operar com: isolamento total entre tenants, auditoria completa, segurança máxima, alta disponibilidade, deploy padronizado e observabilidade completa.

---

## Princípios de Arquitetura

- Security-first
- Multi-tenant strict — toda tabela tem `tenantId`, toda query filtra por `tenantId`
- Event-driven
- Queue-first para tarefas assíncronas
- SDKs externos isolados em `packages/` — nunca chamar APIs externas diretamente de `apps/`
- Full audit logs
- Fail-safe integrations
- Idempotent webhooks
- Observability by default
- Production-ready by default

Prioridade: Segurança → Isolamento → Auditabilidade → Escalabilidade → Performance → Manutenibilidade

---

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **API:** Fastify (Node 20+, TypeScript strict)
- **Web:** Next.js 14 App Router
- **Banco:** PostgreSQL 16 + Prisma
- **Filas:** BullMQ + Redis
- **Auth:** JWT Access Token (15m) + Refresh Rotation (7d), Argon2, device tracking, session invalidation
- **Validação:** Zod
- **Realtime:** Socket.io
- **Pagamentos:** Asaas API v3
- **Alarmes:** CTRL+SAFE SDK, Evolution API
- **Infra dev:** Docker Compose (postgres, redis, pgadmin, redis-commander)
- **Infra prod:** Docker Compose + Traefik v3.2 com HTTPS automático Let's Encrypt
- **Hospedagem:** Hostinger (gerenciado via MCP `hostinger-mcp`)

---

## Estrutura do Monorepo

```
apps/
  api/          — Fastify: auth, superadmin, assinaturas, pontos, ciclos, eventos, supervisores, abertura, field-api, webhooks
  web/          — Next.js 14: rotas (auth), (superadmin), (dashboard)
packages/
  database/     — Prisma schema completo + seed
  asaas-sdk/    — Cliente tipado Asaas API v3 (customers, subscriptions, webhooks)
  ctrlsafe-sdk/ — Cliente CTRL+SAFE para eventos de alarme
  shared/       — Crypto AES-256-GCM
  ui/           — Componentes compartilhados
traefik/        — Configuração Traefik + middlewares de segurança
```

---

## Comandos Essenciais

```bash
# Desenvolvimento
pnpm dev                          # todos os apps em paralelo
pnpm --filter @opencheck/api dev
pnpm --filter @opencheck/web dev

# Build / lint / tipos
pnpm build
pnpm lint
pnpm typecheck

# Banco de dados
pnpm db:generate    # prisma generate
pnpm db:migrate     # prisma migrate dev
pnpm db:push        # prisma db push (dev rápido sem migration)
pnpm db:seed        # seed inicial
pnpm db:studio      # Prisma Studio
```

---

## Convenções de Código

- TypeScript strict em todos os pacotes — sem `any` implícito
- Nomes de arquivos e variáveis em **português** (alinhado ao domínio de negócio)
- Módulos Fastify separados por domínio: `routes`, `service`, `handler`
- Nunca fazer operações de banco diretamente em routes — passar pelo service
- Respostas de webhook Asaas: retornar 200 imediatamente, processar via fila BullMQ
- Idempotência de webhooks por `evt.id` (campo `asaasEventId` na tabela `Cobranca`)
- Terminologia: "Operador" (não "Vigilante")

---

## Pagamentos — Asaas API v3

- Header de autenticação: `access_token: $aact_...`
- Sandbox: `https://sandbox.asaas.com/api/v3`
- Produção: `https://api.asaas.com/v3`
- Webhook validado por header `asaas-access-token`
- Job de sync a cada 6h como failsafe contra webhooks perdidos

---

## MCP Disponível

- **hostinger-mcp** (`hostinger-api-mcp@latest`) — gerenciamento de hospedagem Hostinger via API. Usar para deploys, DNS, domínios e configurações de servidor.

---

## Deploy — Traefik + Hostinger

Traefik é global e já instalado em ambas as VPS. Nunca instalar Traefik por projeto.

Fluxo: `Internet → Traefik → Porta alta local → Container`

```yaml
ports:
  - "127.0.0.1:13001:3001"

labels:
  - "traefik.enable=true"
  - "traefik.docker.network=proxy"
  - "traefik.http.routers.opencheck-api.rule=Host(`api.opencheck.ggtronic.com.br`)"
  - "traefik.http.routers.opencheck-api.entrypoints=websecure"
  - "traefik.http.routers.opencheck-api.tls.certresolver=letsencrypt"
  - "traefik.http.services.opencheck-api.loadbalancer.server.port=3001"
```

HTTPS automático via Let's Encrypt. Redirect HTTP → HTTPS automático.

---

## Alta Disponibilidade — VPS1 + VPS2

### VPS1 (Primary)
- `APP_ROLE=primary` / `DB_ROLE=primary` / `REDIS_ROLE=primary` / `WORKER_ROLE=leader`
- Responsável: API pública, web pública, worker principal, PostgreSQL primary, Redis primary

### VPS2 (Secondary)
- `APP_ROLE=secondary` / `DB_ROLE=replica` / `REDIS_ROLE=replica` / `WORKER_ROLE=standby`
- Responsável: PostgreSQL replica, Redis replica, monitoramento, backups, failover standby
- `ENABLE_PUBLIC_TRAFFIC=false` / `ENABLE_WORKERS=false`

### Replicação PostgreSQL
- Streaming replication, `wal_level=replica`, `archive_mode=on`, `hot_standby=on`
- Full backup diário + incremental a cada 6h + WAL contínuo

### Replicação Redis
- Replica mode, `appendonly yes`, snapshot hourly

---

## Worker Rules

Somente um worker ativo por vez. Controle via Redis distributed lock.

- Key: `worker:leader` / TTL: 30s / Heartbeat: 10s
- VPS1: `WORKER_ROLE=leader`
- VPS2: `WORKER_ROLE=standby` (assume liderança se VPS1 falhar)

---

## Segurança

- Secrets exclusivamente via variáveis de ambiente — nunca hardcoded
- Criptografia de dados sensíveis via `packages/shared` (AES-256-GCM)
- Rate limit e anti brute force em todos os endpoints públicos
- Audit logs completos
- Validação de webhooks por header dedicado
- Token blacklist para logout imediato

---

## Observabilidade

- **Métricas:** Prometheus + Grafana
- **Erros:** Sentry
- **Health endpoints:** `/health`, `/health/db`, `/health/redis`, `/health/replication`

---

## Política de Backup

Retenção: 7 dias hot + 30 dias archive. Scripts em `/infra/scripts/`:
- `backup-db.sh` / `restore-db.sh`
- `backup-redis.sh` / `restore-redis.sh`
- `promote-replica.sh` / `switch-primary.sh`

---

## Plano de Failover

Se VPS1 falhar:
1. Detectar falha
2. Promover PostgreSQL VPS2
3. Promover Redis VPS2
4. Ativar tráfego público VPS2
5. Ativar workers VPS2
6. Atualizar DNS

Todo projeto deve nascer preparado para: failover, restore, backup, replicação, monitoramento e rollback. Nunca criar single point of failure.
