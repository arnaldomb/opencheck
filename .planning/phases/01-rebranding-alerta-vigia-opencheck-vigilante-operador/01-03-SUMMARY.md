# Wave 3 — Módulo Operadores + Imports @opencheck + field-api /operador

**Status:** COMPLETE
**Commit:** 8cfbe2f
**Data:** 2026-06-14

---

## O que foi feito

### Tarefa 1 — Renomear módulo vigilantes → operadores + imports @alerta-vigia → @opencheck

**Arquivo criado:**
- `apps/api/src/modules/operadores/operadores.routes.ts`
  - `@alerta-vigia/database` → `@opencheck/database`
  - `prisma.vigilante.*` → `prisma.operador.*`
  - `vigilantesRoutes` → `operadoresRoutes`
  - Mensagens de erro: 'Vigilante não encontrado' → 'Operador não encontrado'
  - MANTIDO: campo `vigilanteId` no objeto de resposta do GET / (compatibilidade de API externa)

**Arquivo deletado:**
- `apps/api/src/modules/vigilantes/vigilantes.routes.ts` (pasta removida)

**`apps/api/src/index.ts`:**
- `@alerta-vigia/database` → `@opencheck/database`
- import `vigilantesRoutes` → `operadoresRoutes`
- `app.register(..., { prefix: '/vigilantes' })` → `app.register(..., { prefix: '/operadores' })`

**26 arquivos com imports @alerta-vigia → @opencheck atualizados:**

| Arquivo | Pacotes substituídos |
|---|---|
| `apps/api/src/index.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/configuracoes/configuracoes.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/eventos/eventos.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/notificacoes/notificacoes.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/auth/auth.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/cameras/cameras.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/ciclos/ciclos.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/relatorios/relatorios.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/superadmin/superadmin.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/webhooks/webhook.routes.ts` | `@alerta-vigia/asaas-sdk` |
| `apps/api/src/modules/assinaturas/assinaturas.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/assinaturas/webhook.handler.ts` | `@alerta-vigia/database`, `@alerta-vigia/asaas-sdk` |
| `apps/api/src/modules/assinaturas/assinatura.service.ts` | `@alerta-vigia/database`, `@alerta-vigia/asaas-sdk` |
| `apps/api/src/middleware/assinatura.middleware.ts` | `@alerta-vigia/database` |
| `apps/api/src/jobs/ciclo-alerta.job.ts` | `@alerta-vigia/database` |
| `apps/api/src/jobs/ciclo-agendamento.job.ts` | `@alerta-vigia/database` |
| `apps/api/src/jobs/notificacao.job.ts` | `@alerta-vigia/database` |
| `apps/api/src/jobs/assinatura-sync.job.ts` | `@alerta-vigia/database` |
| `apps/api/src/jobs/index.ts` | `@alerta-vigia/asaas-sdk` |
| `apps/api/src/infra/asaas/asaas.client.ts` | `@alerta-vigia/asaas-sdk` |
| `apps/api/src/infra/ezviz/ezviz.factory.ts` | `@alerta-vigia/ezviz-sdk` |
| `apps/api/src/modules/pontos/pontos.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/field-api/field-api.middleware.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/field-api/field-api.routes.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/field-api/field-api.service.ts` | `@alerta-vigia/database` |
| `apps/api/src/modules/field-api/field-api.utils.ts` | `@alerta-vigia/database` |

Total: 26 arquivos com imports atualizados (incluindo 3 que usavam asaas-sdk/ezviz-sdk).

---

### Tarefa 2 — Atualizar field-api — prisma.operador, rota /operador, AgentContext.operadorId

**`field-api.middleware.ts`:**
- `@alerta-vigia/database` → `@opencheck/database`
- `AgentContext.vigilanteId: string | null` → `AgentContext.operadorId: string | null`
- `AgentContext.tipo: 'PONTO' | 'VIGILANTE'` → `tipo: 'PONTO' | 'OPERADOR'`
- Bloco "Try as vigilante key" → "Try as operador key"
- `prisma.vigilante.findUnique(...)` → `prisma.operador.findUnique(...)`
- Variável `vigilante` → `operador` no bloco de autenticação
- Erros: 'Vigilante desativado' → 'Operador desativado'; 'Vigilante não vinculado...' → 'Operador não vinculado...'
- `logAcesso('VIGILANTE', ...)` → `logAcesso('OPERADOR', ...)`
- `request.agentCtx = { ..., vigilanteId: ... }` → `{ ..., operadorId: ... }`
- Função `logAcesso` assinatura: `'PONTO' | 'VIGILANTE'` → `'PONTO' | 'OPERADOR'`
- MANTIDO: `if (!agentKey?.startsWith('av_'))` — prefixo do token não alterado

**`field-api.routes.ts`:**
- `@alerta-vigia/database` → `@opencheck/database`
- Rota `GET /vigilante/:vigilanteId/config` → `GET /operador/:operadorId/config`
- `prisma.vigilante.findFirst(...)` → `prisma.operador.findFirst(...)`
- Variável `vigilante` → `operador` no handler
- Erro `'VIGILANTE_NAO_ENCONTRADO'` → `'OPERADOR_NAO_ENCONTRADO'`
- `tipo: 'VIGILANTE' as const` → `tipo: 'OPERADOR' as const`
- `agentCtx.vigilanteId` → `agentCtx.operadorId`
- `GET /ponto/:pontoId/config`: `vigilanteId: null` → `operadorId: null`
- MANTIDO: campos `vigilanteId` nos bodies de POST /checkin, /panico, /falha

**`field-api.service.ts`:**
- `@alerta-vigia/database` → `@opencheck/database`
- `prisma.vigilante.findFirst(...)` → `prisma.operador.findFirst(...)` em `resolveVigilanteId`
- `ponto.vigilantes` → `ponto.operadores` no include e acesso
- `ctx.vigilanteId` → `ctx.operadorId`
- MANTIDO: chave `vigilanteId` nos retornos e meta dos eventos (compatibilidade de API pública)
- MANTIDO: chave `vigilantes` no retorno de `getConfig` (compatibilidade cliente externo)

**`field-api.utils.ts`:**
- `@alerta-vigia/database` → `@opencheck/database`

**`pontos.routes.ts` (desvio auto-corrigido — Rule 1):**
- Rotas `POST/DELETE /:id/vigilantes/:vigilanteId` → `/:id/operadores/:operadorId`
- `prisma.vigilante.findFirst(...)` → `prisma.operador.findFirst(...)`
- `prisma.ponto.update({ data: { vigilantes: { connect/disconnect } } })` → `{ operadores: { connect/disconnect } }`

**`eventos.routes.ts` e `relatorios.routes.ts` (desvio auto-corrigido — Rule 1):**
- `prisma.vigilante.findMany(...)` → `prisma.operador.findMany(...)`

---

## Resultado das 5 verificações

| # | Verificação | Resultado |
|---|---|---|
| 1 | `grep -r "@alerta-vigia" apps/api/src/` | VAZIO — OK |
| 2 | `grep -r "prisma.vigilante" apps/api/src/` | VAZIO — OK |
| 3 | `grep "prefix.*operadores" apps/api/src/index.ts` | `{ prefix: '/operadores' }` — OK |
| 4 | `grep "/operador/:operadorId" field-api.routes.ts` | `/operador/:operadorId/config` — OK |
| 5 | `ls apps/api/src/modules/vigilantes/` | OK-deletada |

---

## Deviações do Plano

### Auto-corrigidas (Rule 1 — Bug)

**1. prisma.vigilante em pontos.routes.ts**
- Encontrado em: execução da verificação final
- Arquivo: `apps/api/src/modules/pontos/pontos.routes.ts`
- Linhas: rotas POST/DELETE `/:id/vigilantes/:vigilanteId` e chamadas `prisma.vigilante.findFirst`
- Correção: renomeado para `/operadores/:operadorId` e `prisma.operador.findFirst`

**2. prisma.vigilante em eventos.routes.ts**
- Encontrado em: execução da verificação final
- Arquivo: `apps/api/src/modules/eventos/eventos.routes.ts`
- Linha: batch-resolve de nomes de vigilante via `prisma.vigilante.findMany`
- Correção: `prisma.operador.findMany`

**3. prisma.vigilante em relatorios.routes.ts**
- Encontrado em: execução da verificação final
- Arquivo: `apps/api/src/modules/relatorios/relatorios.routes.ts`
- Linha: resolução de nomes de vigilante via `prisma.vigilante.findMany`
- Correção: `prisma.operador.findMany`

## Self-Check: PASSED

- Arquivo criado: `apps/api/src/modules/operadores/operadores.routes.ts` — FOUND
- Pasta deletada: `apps/api/src/modules/vigilantes/` — OK-deletada
- Commit 8cfbe2f — FOUND
- Verificação 1 (@alerta-vigia): VAZIO
- Verificação 2 (prisma.vigilante): VAZIO
- Verificação 3 (prefix /operadores): FOUND
- Verificação 4 (/operador/:operadorId): FOUND
- Verificação 5 (pasta vigilantes): OK-deletada
