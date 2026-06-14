---
phase: "01"
plan: "04"
subsystem: "frontend, infra, docs"
tags: [rebranding, operadores, docker, frontend]
key-files:
  created:
    - apps/web/app/(dashboard)/operadores/page.tsx
  modified:
    - apps/web/app/_components/SidebarLayout.tsx
    - apps/web/app/(dashboard)/onboarding/page.tsx
    - docker-compose.yml
    - docker-compose.prod.yml
    - docker-compose.vps.yml
    - .env.example
    - CLAUDE.md
  deleted:
    - apps/web/app/(dashboard)/vigilantes/page.tsx
decisions:
  - Terminologia "Operador" adotada em todo o codebase (não "Vigilante")
  - Container names seguem padrão opencheck_* em todos os ambientes
metrics:
  completed: "2026-06-14"
---

# Phase 01 Plan 04: Rebranding Wave 4 — Frontend Operadores + Docker/Env/CLAUDE.md Summary

**Status: COMPLETE**

**One-liner:** Rebranding completo do frontend (vigilantes→operadores, Alerta Vigia→OpenCheck) e infraestrutura Docker/env com padronização opencheck_*.

---

## Tarefa 1: Frontend Next.js

### Alterações realizadas

1. **Criado** `apps/web/app/(dashboard)/operadores/page.tsx`
   - Interface `Operador` (renomeada de `Vigilante`)
   - Estado `operadores` (renomeado de `vigilantes`)
   - Todas as chamadas `apiFetch` apontam para `/operadores` e `/operadores/${id}/codigo/gerar`
   - Label do card: `operadorId:` (era `vigilanteId:`)
   - Textos UI: "Operadores", "Nenhum operador cadastrado", "Cadastrar primeiro operador", "Novo operador"
   - Confirm dialog: "Desativar operador" (era "Desativar vigilante")
   - Função `OperadoresPage` (era `VigilantesPage`)

2. **Removido** `apps/web/app/(dashboard)/vigilantes/page.tsx`

3. **Atualizado** `apps/web/app/_components/SidebarLayout.tsx`
   - NAV_USER: `{ href: '/operadores', label: 'Operadores' }` (era `/vigilantes`, `'Vigilantes'`)
   - Logo: `OpenCheck` (era `Alerta Vigia`)

4. **Atualizado** `apps/web/app/(dashboard)/onboarding/page.tsx`
   - Interface `OnboardingStep`: campo `operador` (era `vigilante`)
   - Array `PASSOS`: entrada `{ key: 'operador', label: 'Cadastrar operador', href: '/operadores', desc: 'Adicione o operador responsável pelo ponto' }` (era `vigilante`/`/vigilantes`)
   - Verificação de conclusão: `data?.operador` (era `data?.vigilante`)
   - Título: `Bem-vindo ao OpenCheck` (era `Bem-vindo ao Alerta Vigia`)

5. **`apps/web/lib/api.ts`** — sem referências a `@alerta-vigia` ou `Alerta Vigia`; nenhuma alteração necessária.

### Verificação Tarefa 1

```
grep -rn "Vigilante|vigilantes|Alerta Vigia|@alerta-vigia" SidebarLayout.tsx onboarding/page.tsx api.ts
→ exit 1 (sem matches) — PASSOU
```

---

## Tarefa 2: Docker Compose, .env.example, CLAUDE.md, Makefile

### Alterações realizadas

1. **`docker-compose.yml`** — substituídos todos os `alertavigia` por `opencheck`:
   - `container_name: opencheck_postgres`, `POSTGRES_DB: opencheck`
   - `DATABASE_URL: .../opencheck` (migrate e api)
   - `SUPERADMIN_EMAIL: admin@opencheck.com.br`
   - `container_name: opencheck_redis`, `opencheck_migrate`, `opencheck_api`, `opencheck_web`
   - `container_name: opencheck_pgadmin`, `PGADMIN_DEFAULT_EMAIL: admin@opencheck.com.br`
   - `container_name: opencheck_minio`, `container_name: opencheck_redis_commander`

2. **`docker-compose.prod.yml`** — mesmas substituições alertavigia→opencheck:
   - `container_name: opencheck_postgres`, `POSTGRES_DB: opencheck`
   - `DATABASE_URL: .../opencheck`
   - `container_name: opencheck_redis`, `opencheck_api`, `opencheck_web`

3. **`docker-compose.vps.yml`** — mesmas substituições alertavigia→opencheck:
   - `container_name: opencheck_postgres`, `POSTGRES_DB: opencheck`
   - `DATABASE_URL: .../opencheck`
   - `container_name: opencheck_minio`, `opencheck_api`, `opencheck_web`

4. **`.env.example`** — substituídos todos os `alertavigia` por `opencheck`:
   - `DATABASE_URL=postgresql://.../opencheck`
   - `EMAIL_FROM=noreply@opencheck.com.br`
   - `SUPERADMIN_EMAIL=admin@opencheck.com.br`
   - `DOMAIN=opencheck.com.br`
   - `ACME_EMAIL=admin@opencheck.com.br`

5. **`CLAUDE.md`** — substituições aplicadas:
   - `@alerta-vigia/api` → `@opencheck/api` (2 ocorrências nos comandos pnpm)
   - `@alerta-vigia/web` → `@opencheck/web` (2 ocorrências)
   - `Alerta Vigia` → `OpenCheck` (título e visão geral)
   - Adicionada convenção: `- Terminologia: "Operador" (não "Vigilante")`

6. **`Makefile`** — verificado: sem referências a `alertavigia`; nenhuma alteração necessária.

### Verificação Tarefa 2

```
grep -rn "alertavigia|alerta-vigia|Alerta Vigia" docker-compose.yml docker-compose.prod.yml CLAUDE.md .env.example
→ CLEAN - no matches — PASSOU
```

---

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/app/(dashboard)/operadores/page.tsx` — FOUND
- `apps/web/app/(dashboard)/vigilantes/page.tsx` — DELETED (confirmed)
- Commit `52da95a` — FOUND (`feat(rebranding): frontend operadores, Docker opencheck_*, .env.example e CLAUDE.md`)
- Verification grep Task 1 — PASSED (exit 1, no matches)
- Verification grep Task 2 — PASSED (no matches)
