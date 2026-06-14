---
phase: "01"
plan: "02"
subsystem: database
tags: [prisma, schema, migration, rebranding]
dependency_graph:
  requires: ["01-01"]
  provides: ["Operador model", "updated enums"]
  affects: ["apps/api", "apps/web", "packages/database"]
tech_stack:
  added: []
  patterns: ["Prisma migrate diff", "prisma generate"]
key_files:
  created:
    - packages/database/prisma/migrations/20260614000000_rename_vigilante_to_operador/migration.sql
  modified:
    - packages/database/prisma/schema.prisma
decisions:
  - "Usou prisma migrate diff para gerar SQL correto, criou migration manualmente e registrou como rolled-back no ambiente dev (migrate dev bloqueado em ambiente não-interativo); prisma generate concluído com sucesso"
  - "Migration SQL criada mas não aplicada ao DB dev local — requer execução manual ou migrate deploy em ambiente CI/CD"
metrics:
  duration: "~10min"
  completed: "2026-06-14"
  tasks_completed: 2
  files_modified: 2
---

# Phase 01 Plan 02: Renomear Vigilante→Operador no schema Prisma — Summary

**One-liner:** Renomeou modelo `Vigilante` para `Operador`, atualizou relações, enums e campos em 6 pontos do schema Prisma, gerou migration SQL e regenerou o cliente Prisma.

## Status: PARTIAL

Migration SQL criada e registrada, mas não aplicada ao banco dev local (ambiente não-interativo bloqueia `migrate dev`; `migrate deploy` falhou por transação abortada). `prisma generate` executado com sucesso — cliente TypeScript atualizado.

## Mudanças no Schema (6 modificações)

1. **`model Vigilante` → `model Operador`** — header e comentário de seção renomeados; relação interna `@relation("OperadorPontos")` atualizada
2. **`model Tenant` — campo `vigilantes Vigilante[]` → `operadores Operador[]`** — referência de array atualizada
3. **`model Ponto` — campo `vigilantes Vigilante[] @relation("VigilantePontos")` → `operadores Operador[] @relation("OperadorPontos")`** — campo e nome de relação atualizados
4. **`model OnboardingStep` — campo `vigilante Boolean` → `operador Boolean`** — campo renomeado mantendo `@default(false)`
5. **`enum Papel` — removida linha `VIGILANTE`** — enum ficou com `SUPERADMIN`, `ADMIN`, `OPERADOR`
6. **`enum AgentKeyTipo` — `VIGILANTE` → `OPERADOR`** — valor renomeado

## Verificações grep (pós-edição)

| Padrão | Resultado esperado | Resultado obtido |
|---|---|---|
| `model Vigilante` | zero matches | zero matches |
| `model Operador` | 1 resultado | 1 resultado (linha 160) |
| `VigilantePontos` | zero matches | zero matches |
| `OperadorPontos` | 2 resultados | 2 resultados (linhas 149, 174) |
| `VIGILANTE` no schema | zero matches | zero matches |

## Estado da Migration

- **Arquivo criado:** `packages/database/prisma/migrations/20260614000000_rename_vigilante_to_operador/migration.sql`
- **Método:** `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` para gerar SQL correto
- **Aplicação:** Tentou `migrate deploy` — falhou com "transaction aborted" (possível conflito com `Papel` enum ainda tendo VIGILANTE em uso no DB)
- **Estado no DB:** Migration registrada como `rolled-back` via `prisma migrate resolve --rolled-back`
- **DB atual:** Ainda contém tabela `Vigilante` e enum `AgentKeyTipo(PONTO, VIGILANTE)` — **requer aplicacao manual**

### Para aplicar a migration manualmente:

```bash
# Dentro do container ou com acesso direto ao postgres:
psql -U postgres -d alertavigia -f migration.sql
# Depois marcar como aplicada:
DATABASE_URL=... prisma migrate resolve --applied 20260614000000_rename_vigilante_to_operador
```

## Estado do `prisma generate`

**Sucesso.** Cliente gerado em `node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client` com modelo `Operador` e enums atualizados.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `migrate dev` bloqueado em ambiente não-interativo**
- **Found during:** Tarefa 2
- **Issue:** `prisma migrate dev` retorna erro "non-interactive environment is not supported" quando executado via Bash/shell sem TTY
- **Fix:** Gerou SQL via `prisma migrate diff`, criou arquivo de migration manualmente, tentou `migrate deploy`; após falha de transação, marcou como rolled-back e prosseguiu com `prisma generate`
- **Files modified:** nenhum adicional
- **Commit:** 742c16d

**2. [Rule 3 - Blocking] `pnpm --filter exec prisma` falhava com MODULE_NOT_FOUND**
- **Found during:** Tarefa 2
- **Issue:** Symlinks do pnpm para o binário `prisma` apontavam para `node_modules/prisma/build/index.js` mas o diretório estava vazio (instalação parcial)
- **Fix:** Executou `pnpm install` no root para restaurar dependências; usou binário diretamente de `packages/database/node_modules/.bin/prisma`
- **Files modified:** `pnpm-lock.yaml` (atualizado pelo install)
- **Commit:** 742c16d

## Known Stubs

Nenhum stub introduzido — este plano modifica apenas schema Prisma e migration SQL.

## Self-Check

- [x] `packages/database/prisma/schema.prisma` existe e contém `model Operador`
- [x] `packages/database/prisma/migrations/20260614000000_rename_vigilante_to_operador/migration.sql` existe
- [x] Commit `742c16d` existe
- [x] `prisma generate` concluiu sem erros
