# OpenCheck — CLAUDE.md

## Visão Geral do Projeto

SaaS B2B multi-tenant para gestão de vigilância patrimonial. Empresas de segurança contratam planos com N pontos (portarias/guaritas); cada ponto opera ciclos de alerta cronometrados com check-in do vigilante.

## Stack

- **Monorepo:** Turborepo + pnpm workspaces
- **API:** Fastify (Node 20+, TypeScript strict)
- **Web:** Next.js 14 App Router
- **Banco:** PostgreSQL 16 + Prisma
- **Filas:** BullMQ + Redis
- **Auth:** JWT
- **Realtime:** Socket.io
- **Pagamentos:** Asaas API v3
- **Câmeras:** EZVIZ SDK
- **Alarmes:** CTRL+SAFE SDK, Evolution API
- **Infra dev:** Docker Compose (postgres, redis, pgadmin, redis-commander)
- **Infra prod:** Docker Compose + Traefik v3.2 com HTTPS automático Let's Encrypt
- **Hospedagem:** Hostinger (gerenciado via MCP `hostinger-mcp`)

## Estrutura do Monorepo

```
apps/
  api/          — Fastify: auth, superadmin, assinaturas, pontos, ciclos, câmeras, eventos, webhooks
  web/          — Next.js 14: rotas (auth), (superadmin), (dashboard)
packages/
  database/     — Prisma schema completo + seed
  asaas-sdk/    — Cliente tipado Asaas API v3 (customers, subscriptions, webhooks)
  ezviz-sdk/    — Cliente EZVIZ com auto-refresh de token
  ctrlsafe-sdk/ — Cliente CTRL+SAFE para eventos de alarme
  shared/       — Crypto AES-256-GCM
  ui/           — Componentes compartilhados
traefik/        — Configuração Traefik + middlewares de segurança
```

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

## Convenções de Código

- TypeScript strict em todos os pacotes — sem `any` implícito
- Nomes de arquivos e variáveis em **português** (alinhado ao domínio de negócio)
- Módulos Fastify separados por domínio: `routes`, `service`, `handler`
- Nunca fazer operações de banco diretamente em routes — passar pelo service
- Respostas de webhook Asaas: retornar 200 imediatamente, processar via fila BullMQ
- Idempotência de webhooks por `evt.id` (campo `asaasEventId` na tabela `Cobranca`)
- Terminologia: "Operador" (não "Vigilante")

## Pagamentos — Asaas API v3

- Header de autenticação: `access_token: $aact_...`
- Sandbox: `https://sandbox.asaas.com/api/v3`
- Produção: `https://api.asaas.com/v3`
- Webhook validado por header `asaas-access-token`
- Job de sync a cada 6h como failsafe contra webhooks perdidos

## MCP Disponível

- **hostinger-mcp** (`hostinger-api-mcp@latest`) — gerenciamento de hospedagem Hostinger via API. Usar para deploys, DNS, domínios e configurações de servidor.

## Regras de Arquitetura

- Respeitar separação de módulos por domínio (não misturar lógica de `assinaturas` com `pontos`, etc.)
- SDKs externos ficam em `packages/` — nunca chamar APIs externas diretamente de `apps/`
- Multi-tenancy: toda query Prisma deve filtrar por `tenantId` — nunca expor dados cross-tenant
- Secrets via variáveis de ambiente — nunca hardcoded
- Criptografia de dados sensíveis via `packages/shared` (AES-256-GCM)
