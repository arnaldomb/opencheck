# Roadmap: OpenCheck

## Overview

Transformar o Alerta Vigia em OpenCheck — sistema SaaS B2B multi-tenant para conformidade de abertura de lojas. O rebranding (Fase 1) prepara a base; as fases seguintes constroem a nova lógica de check-in via atalho Windows e dashboard de conformidade.

## Phases

- [ ] **Phase 1: Rebranding — Alerta Vigia → OpenCheck + Vigilante → Operador** - Renomear projeto, pacotes e terminologia em todo o código
- [ ] **Phase 2: Schema — Módulo de Abertura de Lojas** - Adicionar ConfigAbertura, RegistroAbertura e enum StatusAbertura ao banco
- [ ] **Phase 3: API — Módulo de Abertura (check-in e alertas)** - Endpoints de check-in, status, histórico, ranking e jobs BullMQ de alerta
- [ ] **Phase 4: API — Suporte a Cliente Windows** - Ajustes na API para receber check-ins da ferramenta Windows externa
- [ ] **Phase 5: Dashboard — Conformidade de Abertura** - Página com cards em tempo real, histórico e ranking de conformidade
- [ ] **Phase 6: Notificações e Alertas de Atraso** - WhatsApp + e-mail automáticos quando loja não abre no prazo
- [ ] **Phase 7: Seed e Usuários Iniciais** - Dados demo completos: 3 lojas, usuários e 30 dias de histórico

## Phase Details

### Phase 1: Rebranding — Alerta Vigia → OpenCheck + Vigilante → Operador
**Goal**: Todo o projeto reflete a identidade OpenCheck e usa terminologia correta (Operador em vez de Vigilante)
**Depends on**: Nothing (first phase)
**Requirements**: REQ-01, REQ-02, REQ-03
**Success Criteria** (what must be TRUE):
  1. `pnpm typecheck` passa sem erros após renomeação
  2. `pnpm build` compila sem erros
  3. Nenhum pacote com nome `@alerta-vigia` em `package.json` ou imports
  4. Nenhuma referência ao modelo `Vigilante` no código de aplicação (apenas no schema como alias, se necessário)
  5. Enum `Papel.VIGILANTE` removido ou renomeado para `OPERADOR` no schema
**Plans**: 5 planos

Plans:
- [ ] 01-01-PLAN.md — Renomear namespace @alerta-vigia → @opencheck em todos os package.json
- [ ] 01-02-PLAN.md — Schema Prisma: Vigilante → Operador + migration BLOCKING
- [ ] 01-03-PLAN.md — Módulo API vigilantes → operadores + imports @opencheck + field-api
- [ ] 01-04-PLAN.md — Frontend Operadores + Docker opencheck_* + CLAUDE.md
- [ ] 01-05-PLAN.md — Verificação final: typecheck, build e varreduras de completude

### Phase 2: Schema — Módulo de Abertura de Lojas
**Goal**: Banco de dados preparado com modelos ConfigAbertura e RegistroAbertura para registrar janelas e check-ins de abertura
**Depends on**: Phase 1
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. `pnpm db:migrate` executa sem erros
  2. `pnpm db:generate` gera tipos TypeScript para `ConfigAbertura` e `RegistroAbertura`
  3. Enum `StatusAbertura` existe com valores `NO_PRAZO | ATRASADO | AUSENTE`
  4. Relações com `Tenant`, `Ponto` e `Usuario` funcionando corretamente
**Plans**: TBD

### Phase 3: API — Módulo de Abertura (check-in e alertas)
**Goal**: API completa para registrar aberturas, consultar status, histórico e ranking, com jobs BullMQ que disparam alertas quando o deadline passa
**Depends on**: Phase 2
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. `POST /abertura/checkin` retorna 201 com registro criado incluindo status `NO_PRAZO` ou `ATRASADO`
  2. `GET /abertura/status` retorna status do dia para todos os pontos do tenant
  3. `GET /abertura/historico` retorna registros com filtros por ponto/data/status
  4. `GET /abertura/ranking` retorna ranking de conformidade por ponto
  5. Job BullMQ cria `RegistroAbertura` com status `AUSENTE` quando deadline passa sem check-in
  6. Rotas protegidas por JWT com filtro obrigatório de `tenantId`
**Plans**: TBD

### Phase 4: API — Suporte a Cliente Windows
**Goal**: API preparada para receber check-ins da ferramenta Windows com nomeComputador, usuarioWindows e resolução de ponto por máquina
**Depends on**: Phase 3
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. `POST /abertura/checkin` aceita `nomeComputador` e `usuarioWindows` no body e salva corretamente
  2. `GET /abertura/ponto-por-maquina?nome=DESKTOP-ABC` retorna `pontoId` correto
  3. Campo `nomeComputador` existe em `Ponto` e é vinculável
  4. CORS configurado para aceitar requisições de `localhost`
**Plans**: TBD

### Phase 5: Dashboard — Conformidade de Abertura
**Goal**: Dashboard completo para supervisão com cards de status em tempo real (Socket.io), tabela do dia, histórico e ranking de conformidade
**Depends on**: Phase 3
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. Dashboard exibe cards: lojas abertas no horário, atrasadas, ausentes, total
  2. Tabela atualiza sem recarregar quando Socket.io emite `abertura:registrada`
  3. Histórico filtrável por ponto, status e período (7/30/90 dias)
  4. Ranking de conformidade calculado e ordenável
**Plans**: TBD

### Phase 6: Notificações e Alertas de Atraso
**Goal**: Alertas automáticos via WhatsApp e e-mail quando lojas não abrem no prazo, reutilizando infraestrutura de notificações existente
**Depends on**: Phase 3
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. WhatsApp enviado em até 1 min após deadline sem check-in
  2. E-mail enviado quando `emailAlerta` configurado em `ConfigAbertura`
  3. Sem alertas duplicados (idempotência por `RegistroAbertura.id + data`)
  4. Dashboard recebe evento Socket.io `abertura:alerta` em tempo real
**Plans**: TBD

### Phase 7: Seed e Usuários Iniciais
**Goal**: Dados demo completos para demonstração e testes do fluxo completo OpenCheck
**Depends on**: Phase 6
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. `pnpm db:seed` executa sem erros
  2. Login funcionando com superadmin@opencheck.com.br, admin@redeexemplo.com.br e operador@redeexemplo.com.br
  3. 3 pontos (lojas) criados com ConfigAbertura 08:00–08:30 dias úteis
  4. Dashboard exibe 30 dias de histórico com mix de NO_PRAZO, ATRASADO e AUSENTE
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Rebranding | 0/5 | In progress | - |
| 2. Schema | 0/TBD | Not started | - |
| 3. API Abertura | 0/TBD | Not started | - |
| 4. API Windows | 0/TBD | Not started | - |
| 5. Dashboard | 0/TBD | Not started | - |
| 6. Notificações | 0/TBD | Not started | - |
| 7. Seed | 0/TBD | Not started | - |
