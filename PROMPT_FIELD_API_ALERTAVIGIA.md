# Prompt — API de Campo: Consulta de Configuração por Vigilante ou Ponto
## Alerta Vigia — Módulo `agent-api`

> **Objetivo:** Implementar os endpoints públicos (autenticados por `agentKey`) que o **app mobile** e o **software desktop** consomem para saber as configurações do ponto de monitoramento, realizar check-in, enviar pânico e consultar o estado atual do ciclo — tudo a partir do **ID do vigilante** ou do **ID do ponto**.

---

## Contexto

O sistema web (painel) já existe e gerencia:
- Tenants, planos, pontos, vigilantes, câmeras
- Ciclos de alerta por ponto (com herança do padrão da empresa)
- Configurações de notificação

Este módulo é uma **API de campo** — leve, rápida, consumida em campo por:
- **App mobile** do vigilante (Android/iOS)
- **Software desktop** instalado na guarita (Windows)

O vigilante ou o operador do software informa seu **ID** ou o **ID do ponto** e a API retorna tudo que o cliente precisa para operar: tempo entre rondas, tolerância, atalhos de teclado, câmeras vinculadas, e o estado atual do ciclo.

---

## Autenticação da API de Campo

> Não usa JWT de usuário. Usa uma **`agentKey`** — uma chave API simples vinculada ao ponto ou ao vigilante.

### Modelo

```
Cada Ponto tem uma agentKey única gerada automaticamente.
Cada Vigilante pode ter sua própria agentKey (para o app mobile).
A agentKey é enviada no header: x-agent-key: av_live_XXXXXXXXXX
```

### Geração da chave

```typescript
// Formato: av_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (produção)
//          av_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX (sandbox/dev)
// 32 chars hex aleatórios após o prefixo

export function generateAgentKey(env: 'live' | 'test' = 'live'): string {
  const random = crypto.randomBytes(16).toString('hex') // 32 chars hex
  return `av_${env}_${random}`
}
```

### Adições ao Schema Prisma

```prisma
// Adicionar ao model Ponto:
model Ponto {
  // ... campos existentes ...

  agentKey     String   @unique @default("")  // av_live_XXXXXXXXXXXXXXXXXXXXXXXX
  agentKeyAt   DateTime?                       // quando foi gerada/regenerada
}

// Adicionar ao model Vigilante:
model Vigilante {
  // ... campos existentes ...

  agentKey     String?  @unique               // av_live_XXXXXXXXXXXXXXXX (gerada no app)
  agentKeyAt   DateTime?
  ultimoLogin  DateTime?
  appVersao    String?                         // versão do app do vigilante
  deviceInfo   String?                         // JSON com info do dispositivo
}

// Novo: log de acesso da agentKey (auditoria)
model AgentKeyLog {
  id         String   @id @default(cuid())
  tipo       AgentKeyTipo   // PONTO | VIGILANTE
  referenciaId String       // pontoId ou vigilanteId
  tenantId   String
  acao       String         // CONFIG_CONSULTA | CHECKIN | PANICO | STATUS
  ip         String?
  userAgent  String?
  criadoEm DateTime @default(now())
}

enum AgentKeyTipo { PONTO VIGILANTE }
```

---

## Endpoints da API de Campo

**Base URL:** `/api/field/v1`

**Header obrigatório em todos:** `x-agent-key: av_live_XXXXXXXXXX`

**Rate limiting:** 60 req/min por agentKey

---

### `GET /config`

> Retorna a configuração completa do ponto vinculado à `agentKey`.
> Usado na **inicialização** do app ou software para carregar todas as configurações.
> Pode ser chamado com a chave do **ponto** ou do **vigilante**.

**Header:** `x-agent-key: av_live_abc123...`

**Response 200:**

```json
{
  "ponto": {
    "id": "clm1abc...",
    "nome": "Portaria Principal",
    "descricao": "Entrada principal do condomínio",
    "endereco": "Av. Paulista, 1000 – São Paulo/SP",
    "ativo": true
  },
  "vigilante": {
    "id": "clm2def...",
    "nome": "João Silva",
    "telefone": "+55 11 99123-4567"
  },
  "ciclo": {
    "duracaoMinutos": 10,
    "toleranciaMinutos": 2,
    "avisoAntesMinutos": 5,
    "codigoCheckin": "1602",
    "codigoPanico": "1122",
    "codigoFalha": "1130",
    "capturarSnapshot": true,
    "autoReiniciar": true,
    "heranca": "proprio"
  },
  "atalhos": {
    "checkin": {
      "modificador": "Ctrl+Alt",
      "tecla": "V"
    },
    "panico": {
      "modificador": "Ctrl+Alt",
      "tecla": "P"
    }
  },
  "cameras": [
    {
      "id": "clm3ghi...",
      "deviceSerial": "L58661369",
      "deviceName": "CS-H1c (1080P)",
      "channelNo": 1,
      "ativa": true
    }
  ],
  "canalAlerta": "WHATSAPP",
  "empresa": {
    "id": "clm4jkl...",
    "nome": "Segurança Total Ltda"
  },
  "serverTime": "2026-04-25T14:30:00.000Z"
}
```

**Nota sobre `heranca`:**
- `"proprio"` → o ponto tem ConfigCiclo próprio
- `"empresa"` → usando o padrão do tenant

---

### `GET /config/ciclo`

> Retorna **somente** as métricas de tempo do ciclo (endpoint leve para polling periódico).
> Permite que o software detecte mudanças de configuração sem recarregar tudo.

**Response 200:**

```json
{
  "pontoId": "clm1abc...",
  "duracaoMinutos": 10,
  "toleranciaMinutos": 2,
  "avisoAntesMinutos": 5,
  "expiraEm": "2026-04-25T14:40:00.000Z",
  "heranca": "proprio",
  "versaoConfig": "2026-04-25T10:00:00.000Z",
  "serverTime": "2026-04-25T14:30:00.000Z"
}
```

**`versaoConfig`** = `ConfigCiclo.atualizadoEm` — o software compara com o valor anterior; se mudou, recarrega a config completa via `GET /config`.

---

### `GET /status`

> Retorna o **estado atual do ciclo** em execução para o ponto.
> Chamado periodicamente pelo app/software para atualizar o timer na tela.

**Response 200 — Ciclo em andamento:**

```json
{
  "pontoId": "clm1abc...",
  "execucaoId": "clm5mno...",
  "status": "EM_ANDAMENTO",
  "iniciadoEm": "2026-04-25T14:30:00.000Z",
  "expiraEm": "2026-04-25T14:42:00.000Z",
  "segundosRestantes": 720,
  "faseAtual": "NORMAL",
  "serverTime": "2026-04-25T14:30:00.000Z"
}
```

**Response 200 — Fase de aviso (faltam X minutos):**

```json
{
  "pontoId": "clm1abc...",
  "execucaoId": "clm5mno...",
  "status": "EM_ANDAMENTO",
  "iniciadoEm": "2026-04-25T14:30:00.000Z",
  "expiraEm": "2026-04-25T14:42:00.000Z",
  "segundosRestantes": 180,
  "faseAtual": "AVISO",
  "serverTime": "2026-04-25T14:39:00.000Z"
}
```

**Response 200 — Alerta disparado (ciclo expirou):**

```json
{
  "pontoId": "clm1abc...",
  "execucaoId": "clm5mno...",
  "status": "ALERTA",
  "iniciadoEm": "2026-04-25T14:30:00.000Z",
  "expiraEm": "2026-04-25T14:42:00.000Z",
  "alertaEm": "2026-04-25T14:42:00.000Z",
  "segundosRestantes": 0,
  "faseAtual": "ALERTA",
  "serverTime": "2026-04-25T14:42:30.000Z"
}
```

**Response 200 — Nenhum ciclo ativo:**

```json
{
  "pontoId": "clm1abc...",
  "execucaoId": null,
  "status": "INATIVO",
  "faseAtual": "INATIVO",
  "serverTime": "2026-04-25T14:30:00.000Z"
}
```

**Lógica de `faseAtual`:**

```
NORMAL  → segundosRestantes > avisoAntesMinutos * 60
AVISO   → segundosRestantes <= avisoAntesMinutos * 60 && > 0
ALERTA  → status = ALERTA (ciclo expirou)
INATIVO → nenhum ciclo ativo
```

---

### `POST /checkin`

> Vigilante registra o check-in. Cancela o timer atual e inicia o próximo ciclo.

**Body:**

```json
{
  "vigilanteId": "clm2def...",
  "observacao": "Ronda normal concluída"
}
```

> `vigilanteId` é opcional — se a chave for de vigilante, ele é inferido automaticamente.

**Response 200:**

```json
{
  "aceito": true,
  "execucaoId": "clm5mno...",
  "proximoCiclo": {
    "iniciadoEm": "2026-04-25T14:30:05.000Z",
    "expiraEm": "2026-04-25T14:42:05.000Z",
    "duracaoMinutos": 10,
    "toleranciaMinutos": 2
  },
  "serverTime": "2026-04-25T14:30:05.000Z"
}
```

**Response 400 — Nenhum ciclo ativo para fazer check-in:**

```json
{
  "aceito": false,
  "erro": "CICLO_INATIVO",
  "mensagem": "Não há ciclo ativo para este ponto no momento"
}
```

---

### `POST /panico`

> Vigilante aciona botão de pânico. Dispara alerta imediato via canal configurado.

**Body:**

```json
{
  "vigilanteId": "clm2def...",
  "tipo": "PANICO",
  "observacao": "Situação de risco"
}
```

**`tipo`:**
- `"PANICO"` → código 1120 (pânico explícito)
- `"PANICO_SILENCIOSO"` → código 1122 (sem som, sem visibilidade)
- `"COACAO"` → código 1121 (duress — operador sob ameaça)

**Response 200:**

```json
{
  "aceito": true,
  "eventoId": "clm6pqr...",
  "tipo": "PANICO_SILENCIOSO",
  "codigoEvento": "1122",
  "canalDisparado": "WHATSAPP",
  "serverTime": "2026-04-25T14:35:00.000Z"
}
```

---

### `POST /ciclo/iniciar`

> Inicia um ciclo manualmente (quando `autoReiniciar = false` ou após restauração de alarme).

**Body:** `{}` (vazio — o ponto é inferido pela agentKey)

**Response 200:**

```json
{
  "iniciado": true,
  "execucaoId": "clm7stu...",
  "expiraEm": "2026-04-25T14:45:00.000Z",
  "duracaoMinutos": 10,
  "toleranciaMinutos": 2,
  "serverTime": "2026-04-25T14:33:00.000Z"
}
```

---

### `GET /vigilante/:vigilanteId/config`

> Consulta por **ID do vigilante** — retorna o ponto vinculado + configurações.
> Útil quando o software desktop precisa consultar pelo ID sem ter a agentKey do ponto.
> Requer agentKey de qualquer tipo (ponto ou vigilante do mesmo tenant).

**Response 200:**

```json
{
  "vigilante": {
    "id": "clm2def...",
    "nome": "João Silva",
    "telefone": "+55 11 99123-4567",
    "ativo": true
  },
  "ponto": {
    "id": "clm1abc...",
    "nome": "Portaria Principal",
    "endereco": "Av. Paulista, 1000 – São Paulo/SP"
  },
  "ciclo": {
    "duracaoMinutos": 10,
    "toleranciaMinutos": 2,
    "avisoAntesMinutos": 5,
    "heranca": "proprio"
  },
  "cameras": [
    {
      "id": "clm3ghi...",
      "deviceSerial": "L58661369",
      "channelNo": 1,
      "ativa": true
    }
  ],
  "agentKeyPonto": "av_live_abc123...",
  "serverTime": "2026-04-25T14:30:00.000Z"
}
```

> **Importante:** `agentKeyPonto` é retornado neste endpoint para que o software possa
> armazenar a chave do ponto e usar diretamente nos endpoints `/checkin`, `/status` etc.
> Só retornado se a agentKey do request pertencer ao mesmo tenant do vigilante.

---

### `GET /ponto/:pontoId/config`

> Consulta por **ID do ponto** — mesmo resultado do `GET /config` mas por ID explícito.
> Útil quando o software desktop tem o pontoId salvo em configuração local.

**Response 200:** mesmo formato do `GET /config`

---

### `POST /agentkey/registrar`

> Registra ou renova a `agentKey` de um vigilante — chamado no **primeiro login do app mobile**.
> A chave fica vinculada ao dispositivo.

**Body:**

```json
{
  "vigilanteId": "clm2def...",
  "deviceInfo": {
    "modelo": "Samsung Galaxy A54",
    "so": "Android 14",
    "appVersao": "1.2.0"
  }
}
```

**Autenticação especial:** este endpoint aceita um `tenantKey` (chave pública do tenant, gerada no painel, sem privilégios de escrita) em vez da agentKey.

**Response 200:**

```json
{
  "agentKey": "av_live_xyz789...",
  "vigilanteId": "clm2def...",
  "pontoId": "clm1abc...",
  "nomePonto": "Portaria Principal",
  "serverTime": "2026-04-25T14:30:00.000Z"
}
```

---

## Implementação do Módulo

### Estrutura de arquivos

```
apps/api/src/modules/field-api/
├── field-api.routes.ts        # Registro das rotas /api/field/v1/*
├── field-api.middleware.ts    # Validação da agentKey (resolve ponto + tenant)
├── field-api.service.ts       # Lógica de negócio
├── field-api.types.ts         # Types e interfaces da resposta
└── field-api.schema.ts        # Schemas Zod de validação
```

### Middleware de autenticação por agentKey

```typescript
// apps/api/src/modules/field-api/field-api.middleware.ts

interface AgentContext {
  tenantId: string
  pontoId: string
  vigilanteId: string | null
  tipo: 'PONTO' | 'VIGILANTE'
}

export async function resolveAgentKey(agentKey: string): Promise<AgentContext> {
  if (!agentKey?.startsWith('av_')) {
    throw new AgentKeyInvalidaError('Formato de chave inválido')
  }

  // Tentar resolver como chave de ponto
  const ponto = await prisma.ponto.findUnique({
    where: { agentKey },
    include: { tenant: { select: { id: true, ativo: true } } }
  })

  if (ponto) {
    if (!ponto.ativo) throw new PontoInativoError('Ponto desativado')
    if (!ponto.tenant.ativo) throw new TenantInativoError('Conta inativa')

    await verificarAssinaturaAtiva(ponto.tenantId)

    return {
      tenantId: ponto.tenantId,
      pontoId: ponto.id,
      vigilanteId: null,
      tipo: 'PONTO'
    }
  }

  // Tentar resolver como chave de vigilante
  const vigilante = await prisma.vigilante.findUnique({
    where: { agentKey },
    include: {
      ponto: true,
      tenant: { select: { id: true, ativo: true } }
    }
  })

  if (vigilante) {
    if (!vigilante.ativo) throw new VigilanteInativoError('Vigilante desativado')
    if (!vigilante.tenant.ativo) throw new TenantInativoError('Conta inativa')
    if (!vigilante.pontoId) throw new SemPontoError('Vigilante não vinculado a nenhum ponto')

    await verificarAssinaturaAtiva(vigilante.tenantId)

    return {
      tenantId: vigilante.tenantId,
      pontoId: vigilante.pontoId,
      vigilanteId: vigilante.id,
      tipo: 'VIGILANTE'
    }
  }

  throw new AgentKeyInvalidaError('Chave não encontrada')
}
```

### Serviço principal

```typescript
// apps/api/src/modules/field-api/field-api.service.ts

export class FieldApiService {

  // ── GET /config ─────────────────────────────────────────────────────────────

  async getConfig(ctx: AgentContext): Promise<ConfigResponse> {
    const [ponto, cicloConfig, execucaoAtiva] = await Promise.all([
      prisma.ponto.findUnique({
        where: { id: ctx.pontoId },
        include: {
          vigilantes: { where: { ativo: true }, select: { id: true, nome: true, telefone: true } },
          cameras: { where: { ativa: true }, select: { id: true, deviceSerial: true, deviceName: true, channelNo: true, ativa: true } },
          tenant: { select: { id: true, nome: true } }
        }
      }),
      getConfigCiclo(ctx.pontoId, ctx.tenantId),   // herança empresa → ponto
      getExecucaoAtiva(ctx.pontoId)
    ])

    // Buscar atalhos de teclado (salvos no ConfigCiclo como campo JSON ou tabela própria)
    const atalhos = cicloConfig.atalhos ?? {
      checkin: { modificador: 'Ctrl+Alt', tecla: 'V' },
      panico:  { modificador: 'Ctrl+Alt', tecla: 'P' }
    }

    // Determinar vigilante ativo no ponto
    const vigilante = ctx.vigilanteId
      ? ponto!.vigilantes.find(v => v.id === ctx.vigilanteId) ?? null
      : ponto!.vigilantes[0] ?? null

    return {
      ponto: {
        id: ponto!.id,
        nome: ponto!.nome,
        descricao: ponto!.descricao,
        endereco: ponto!.endereco,
        ativo: ponto!.ativo
      },
      vigilante,
      ciclo: {
        duracaoMinutos: cicloConfig.duracaoMinutos,
        toleranciaMinutos: cicloConfig.toleranciaMinutos,
        avisoAntesMinutos: cicloConfig.avisoAntesMin,
        codigoCheckin: cicloConfig.codigoCheckin,
        codigoPanico: cicloConfig.codigoPanico,
        codigoFalha: cicloConfig.codigoFalha,
        capturarSnapshot: cicloConfig.capturarSnapshot,
        autoReiniciar: cicloConfig.autoReiniciar,
        heranca: cicloConfig.pontoId ? 'proprio' : 'empresa',
        versaoConfig: cicloConfig.atualizadoEm.toISOString()
      },
      atalhos,
      cameras: ponto!.cameras,
      canalAlerta: ponto!.canalAlerta ?? await getCanalPadraoTenant(ctx.tenantId),
      empresa: { id: ponto!.tenant.id, nome: ponto!.tenant.nome },
      serverTime: new Date().toISOString()
    }
  }

  // ── GET /status ──────────────────────────────────────────────────────────────

  async getStatus(ctx: AgentContext): Promise<StatusResponse> {
    const execucao = await getExecucaoAtiva(ctx.pontoId)
    const config = await getConfigCiclo(ctx.pontoId, ctx.tenantId)

    if (!execucao) {
      return { pontoId: ctx.pontoId, execucaoId: null, status: 'INATIVO', faseAtual: 'INATIVO', serverTime: new Date().toISOString() }
    }

    const agora = new Date()
    const segundosRestantes = Math.max(0, Math.floor((execucao.expiraEm.getTime() - agora.getTime()) / 1000))
    const limiteAviso = config.avisoAntesMin * 60

    const faseAtual: FaseAtual =
      execucao.status === 'ALERTA' ? 'ALERTA' :
      segundosRestantes <= limiteAviso ? 'AVISO' : 'NORMAL'

    return {
      pontoId: ctx.pontoId,
      execucaoId: execucao.id,
      status: execucao.status,
      iniciadoEm: execucao.iniciadoEm.toISOString(),
      expiraEm: execucao.expiraEm.toISOString(),
      alertaEm: execucao.alertaEm?.toISOString() ?? null,
      segundosRestantes,
      faseAtual,
      serverTime: agora.toISOString()
    }
  }

  // ── POST /checkin ────────────────────────────────────────────────────────────

  async registrarCheckin(ctx: AgentContext, body: CheckinBody): Promise<CheckinResponse> {
    const execucao = await getExecucaoAtiva(ctx.pontoId)

    if (!execucao) {
      return { aceito: false, erro: 'CICLO_INATIVO', mensagem: 'Não há ciclo ativo para este ponto' }
    }

    const vigilanteId = body.vigilanteId ?? ctx.vigilanteId

    // Cancelar jobs BullMQ pendentes
    if (execucao.avisoJobId) await alertaQueue.remove(execucao.avisoJobId)
    if (execucao.expiraJobId) await alertaQueue.remove(execucao.expiraJobId)

    // Finalizar execução atual
    await prisma.execucaoCiclo.update({
      where: { id: execucao.id },
      data: { status: 'CONCLUIDO', checkinEm: new Date(), finalizadoEm: new Date() }
    })

    // Registrar evento de check-in
    await prisma.evento.create({
      data: {
        tenantId: ctx.tenantId,
        pontoId: ctx.pontoId,
        tipo: 'CHECKIN',
        meta: { vigilanteId, observacao: body.observacao }
      }
    })

    // Emitir via Socket.io para o dashboard em tempo real
    io.to(`tenant:${ctx.tenantId}`).emit('checkin:recebido', {
      pontoId: ctx.pontoId, vigilanteId, timestamp: new Date().toISOString()
    })

    // Enviar evento 1602 via canal (CTRL+SAFE ou log WhatsApp silencioso)
    await notificacaoQueue.add('checkin', { tenantId: ctx.tenantId, pontoId: ctx.pontoId, vigilanteId })

    // Iniciar próximo ciclo automaticamente
    const config = await getConfigCiclo(ctx.pontoId, ctx.tenantId)
    let proximoCiclo = null

    if (config.autoReiniciar) {
      proximoCiclo = await iniciarCiclo(ctx.pontoId, ctx.tenantId)
    }

    return {
      aceito: true,
      execucaoId: execucao.id,
      proximoCiclo: proximoCiclo ? {
        iniciadoEm: proximoCiclo.iniciadoEm.toISOString(),
        expiraEm: proximoCiclo.expiraEm.toISOString(),
        duracaoMinutos: config.duracaoMinutos,
        toleranciaMinutos: config.toleranciaMinutos
      } : null,
      serverTime: new Date().toISOString()
    }
  }

  // ── POST /panico ─────────────────────────────────────────────────────────────

  async dispararPanico(ctx: AgentContext, body: PanicoBody): Promise<PanicoResponse> {
    const CODIGOS = {
      PANICO: '1120',
      PANICO_SILENCIOSO: '1122',
      COACAO: '1121'
    }

    const codigoEvento = CODIGOS[body.tipo ?? 'PANICO_SILENCIOSO']

    const evento = await prisma.evento.create({
      data: {
        tenantId: ctx.tenantId,
        pontoId: ctx.pontoId,
        tipo: 'PANICO',
        meta: {
          vigilanteId: body.vigilanteId ?? ctx.vigilanteId,
          tipo: body.tipo,
          codigoEvento,
          observacao: body.observacao
        }
      }
    })

    // Capturar snapshot EZVIZ (se câmera vinculada)
    const cameras = await prisma.camera.findMany({
      where: { pontoId: ctx.pontoId, ativa: true }
    })
    const snapshotUrls: string[] = []
    for (const cam of cameras) {
      try {
        const snap = await captureSnapshot(cam.id, evento.id)
        snapshotUrls.push(snap.imageUrl)
      } catch {}
    }

    // Disparar alerta imediato (fora da fila — prioridade máxima)
    const canal = await getCanalAlerta(ctx.pontoId, ctx.tenantId)
    await dispatch({
      pontoId: ctx.pontoId,
      tenantId: ctx.tenantId,
      tipo: 'ALERTA',
      mensagem: `🚨 *PÂNICO* — ${(await prisma.ponto.findUnique({ where: { id: ctx.pontoId } }))!.nome}\nVigilante acionou botão de pânico.\nVerifique imediatamente!`,
      snapshotUrls,
      codigoEvento
    })

    // Emitir realtime
    io.to(`tenant:${ctx.tenantId}`).emit('panico:disparado', {
      pontoId: ctx.pontoId, codigoEvento, timestamp: new Date().toISOString()
    })

    return {
      aceito: true,
      eventoId: evento.id,
      tipo: body.tipo ?? 'PANICO_SILENCIOSO',
      codigoEvento,
      canalDisparado: canal,
      serverTime: new Date().toISOString()
    }
  }
}
```

---

## Adições ao Schema Prisma para Atalhos de Teclado

> A imagem mostra atalhos de teclado (Ctrl+Alt+V para check-in, Ctrl+Alt+P para pânico).
> Guardar por ponto/ciclo para o software desktop sincronizar.

```prisma
// Adicionar ao model ConfigCiclo:
model ConfigCiclo {
  // ... campos existentes ...

  // Atalhos de teclado (usado pelo software desktop)
  atalhoCheckinModificador String @default("Ctrl+Alt")
  atalhoCheckinTecla       String @default("V")
  atalhoPanicoModificador  String @default("Ctrl+Alt")
  atalhoPanicoTecla        String @default("P")
}
```

---

## Tabela de Endpoints Resumida

```
BASE: /api/field/v1
AUTH: header x-agent-key: av_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

GET    /config                          Config completa (ponto + ciclo + câmeras + atalhos)
GET    /config/ciclo                    Só métricas de tempo (polling leve de mudanças)
GET    /status                          Estado atual do ciclo (timer, fase, segundos restantes)
POST   /checkin                         Registrar check-in do vigilante
POST   /panico                          Disparar pânico (1120 / 1122 / 1121)
POST   /ciclo/iniciar                   Iniciar ciclo manualmente
GET    /vigilante/:vigilanteId/config   Consultar por ID do vigilante (retorna agentKey do ponto)
GET    /ponto/:pontoId/config           Consultar por ID do ponto
POST   /agentkey/registrar              Registrar/renovar agentKey no app mobile (usa tenantKey)
```

---

## Fluxo de Integração — App Mobile

```
1. PRIMEIRO USO:
   POST /agentkey/registrar { vigilanteId, deviceInfo }
   → Recebe agentKey → salva localmente no dispositivo

2. INICIALIZAÇÃO:
   GET /config
   → Carrega: ciclo, atalhos, câmeras, canal de alerta
   → Inicia timer local com duracaoMinutos

3. POLLING LEVE (a cada 30s):
   GET /config/ciclo
   → Compara versaoConfig com o valor salvo
   → Se mudou: recarrega GET /config completo

4. POLLING DE STATUS (a cada 5s):
   GET /status
   → Atualiza timer na tela
   → Exibe fase: NORMAL / AVISO / ALERTA

5. CHECK-IN:
   POST /checkin { vigilanteId?, observacao? }
   → Timer reinicia com dados do proximoCiclo

6. PÂNICO:
   POST /panico { tipo: "PANICO_SILENCIOSO" }
   → Confirma envio do alerta
```

## Fluxo de Integração — Software Desktop

```
1. CONFIGURAÇÃO INICIAL:
   Operador digita ID do ponto ou do vigilante na tela de configuração
   GET /ponto/:pontoId/config   ou   GET /vigilante/:vigilanteId/config
   → Recebe agentKey do ponto + configurações completas
   → Salva agentKey e configurações no registry/arquivo local

2. INICIALIZAÇÃO DO SISTEMA:
   GET /config (usando agentKey salva)
   → Carrega atalhos de teclado: Ctrl+Alt+V / Ctrl+Alt+P
   → Inicia monitoramento de teclas
   → Inicia timer visual

3. VERIFICAÇÃO DE MUDANÇAS (a cada 60s):
   GET /config/ciclo
   → Se versaoConfig mudou: recarregar tudo + reconfigurar atalhos

4. CHECK-IN VIA ATALHO (Ctrl+Alt+V):
   POST /checkin
   → Feedback visual na tela

5. PÂNICO VIA ATALHO (Ctrl+Alt+P):
   POST /panico { tipo: "PANICO_SILENCIOSO" }
   → Feedback visual + sonoro
```

---

## Códigos de Erro da API de Campo

```typescript
// HTTP 401
{ "erro": "AGENT_KEY_INVALIDA",    "mensagem": "Chave inválida ou expirada" }
{ "erro": "PONTO_INATIVO",         "mensagem": "Este ponto está desativado" }
{ "erro": "TENANT_INATIVO",        "mensagem": "Conta da empresa inativa" }
{ "erro": "ASSINATURA_CANCELADA",  "mensagem": "Assinatura cancelada. Contate o administrador." }
{ "erro": "VIGILANTE_INATIVO",     "mensagem": "Vigilante desativado" }
{ "erro": "SEM_PONTO",             "mensagem": "Vigilante não vinculado a nenhum ponto" }

// HTTP 400
{ "erro": "CICLO_INATIVO",         "mensagem": "Não há ciclo ativo para este ponto" }
{ "erro": "TIPO_PANICO_INVALIDO",  "mensagem": "Tipo deve ser PANICO, PANICO_SILENCIOSO ou COACAO" }

// HTTP 404
{ "erro": "VIGILANTE_NAO_ENCONTRADO", "mensagem": "Vigilante não encontrado neste tenant" }
{ "erro": "PONTO_NAO_ENCONTRADO",     "mensagem": "Ponto não encontrado" }

// HTTP 429
{ "erro": "RATE_LIMIT",            "mensagem": "Muitas requisições. Aguarde 60 segundos." }
```

---

## Adições à Tela de Pontos (Painel Web)

> Para que o gestor possa copiar a `agentKey` e configurar no software desktop:

```
Card do ponto deve exibir:
  [ Configurações do Agente ]
    agentKey: av_live_abc123...  [ Copiar ] [ Regenerar ]
    ID do ponto: clm1abc...      [ Copiar ]
    QR Code → abre modal com QR contendo { pontoId, agentKey }
              para scanear direto pelo app mobile
```

---

## Variáveis de Ambiente Adicionais

```env
# Prefixo da agentKey
AGENT_KEY_ENV=live        # 'live' em produção, 'test' em desenvolvimento
# Chave usada apenas para registro inicial via app (tenantKey — baixo privilégio)
TENANT_PUBLIC_KEY_SECRET=outro-secret-para-hmac-das-tenant-keys
```

---

## Entregáveis deste Módulo

1. `apps/api/src/modules/field-api/field-api.routes.ts`
2. `apps/api/src/modules/field-api/field-api.middleware.ts` — resolve agentKey
3. `apps/api/src/modules/field-api/field-api.service.ts` — toda a lógica
4. `apps/api/src/modules/field-api/field-api.types.ts` — interfaces de request/response
5. `apps/api/src/modules/field-api/field-api.schema.ts` — validações Zod
6. Adição dos campos `agentKey`, `atalhos` ao schema Prisma
7. Migration Prisma para `agentKey` em `Ponto` e `Vigilante`
8. Script de seed que gera `agentKey` para todos os pontos existentes
9. Componente web: card do ponto com agentKey + botão copiar + QR Code
