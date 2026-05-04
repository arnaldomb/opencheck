# Prompt de Arquitetura — Plataforma SaaS Multi-Tenant Alerta Vigia v4
## Integração Asaas — Documentação Oficial Validada

> **Objetivo:** Scaffold completo de um monorepo SaaS multi-tenant para gestão de pontos de Alerta Vigia, com assinaturas recorrentes via **Asaas API v3** (Boleto, Pix, Cartão), licenciamento por pontos contratados, integração EZVIZ para snapshots e dois canais de notificação configuráveis (WhatsApp via Evolution API ou central de alarme via CTRL+SAFE).

---

## Visão de Produto

**Alerta Vigia** é um SaaS B2B vendido para empresas de segurança patrimonial:

1. Superadmin cria a conta da empresa cliente e escolhe o plano
2. Asaas cria o customer e a subscription recorrente automaticamente
3. Cliente recebe e-mail de boas-vindas e acessa o painel
4. Cliente passa pelo checklist de onboarding (5 passos)
5. Cada **ponto** (portaria/guarita) consome 1 unidade do plano contratado
6. Cada ponto tem seu ciclo de alerta próprio: duração + tolerância + canal de notificação
7. Vigilante perde o horário → sistema captura snapshot EZVIZ + dispara alerta

**Fluxo pós-venda (misto):**
- Superadmin cria empresa + assinatura Asaas
- Cliente recebe acesso e finaliza a configuração dos pontos
- Asaas gerencia toda a cobrança recorrente de forma autônoma

---

## Stack Tecnológica

```
Linguagem:       TypeScript (strict mode)
Monorepo:        Turborepo + pnpm workspaces
Backend:         Node.js + Fastify
Frontend:        Next.js 14 (App Router)
Banco de Dados:  PostgreSQL 16
ORM:             Prisma
Filas / Jobs:    BullMQ + Redis
Autenticação:    JWT próprio (access 15min + refresh 7d) + bcrypt
Realtime:        Socket.io
Pagamentos:      Asaas API v3 — base URL: https://api.asaas.com/v3
                 Sandbox:       https://sandbox.asaas.com/api/v3
Notificações:    Evolution API (WhatsApp) + CTRL+SAFE (alarme)
Câmeras:         EZVIZ Open Platform
Criptografia:    AES-256-GCM para secrets no banco
Logs:            Pino (JSON estruturado)
Testes:          Vitest + Playwright
CI/CD:           GitHub Actions
Dev:             Docker Compose
```

---

## Estrutura do Monorepo

```
alerta-vigia/
├── apps/
│   ├── web/                               # Next.js 14
│   │   └── app/
│   │       ├── (auth)/
│   │       │   ├── login/
│   │       │   ├── esqueci-senha/
│   │       │   └── redefinir-senha/
│   │       ├── (superadmin)/
│   │       │   ├── overview/
│   │       │   ├── clientes/
│   │       │   │   ├── page.tsx
│   │       │   │   ├── novo/page.tsx
│   │       │   │   └── [id]/page.tsx
│   │       │   ├── planos/
│   │       │   └── financeiro/
│   │       └── (dashboard)/
│   │           ├── onboarding/
│   │           ├── overview/
│   │           ├── pontos/
│   │           │   ├── page.tsx
│   │           │   ├── novo/page.tsx
│   │           │   └── [id]/
│   │           │       ├── page.tsx
│   │           │       ├── ciclo/
│   │           │       ├── cameras/
│   │           │       └── historico/
│   │           ├── vigilantes/
│   │           ├── cameras/
│   │           ├── eventos/
│   │           ├── relatorios/
│   │           ├── plano/
│   │           └── configuracoes/
│   │               ├── notificacoes/
│   │               ├── ezviz/
│   │               └── usuarios/
│   │
│   └── api/                               # Fastify
│       └── src/
│           ├── modules/
│           │   ├── auth/
│           │   ├── superadmin/
│           │   ├── clientes/
│           │   ├── planos/
│           │   ├── assinaturas/           # Integração Asaas
│           │   ├── pontos/
│           │   ├── vigilantes/
│           │   ├── cameras/
│           │   ├── ciclos/
│           │   ├── eventos/
│           │   ├── notificacoes/
│           │   ├── relatorios/
│           │   └── websocket/
│           ├── jobs/
│           │   ├── ciclo-alerta.job.ts
│           │   ├── notificacao.job.ts
│           │   └── assinatura-sync.job.ts
│           └── infra/
│               ├── prisma/
│               ├── redis/
│               ├── asaas/
│               ├── ezviz/
│               └── ctrlsafe/
│
├── packages/
│   ├── database/
│   ├── asaas-sdk/                         # Cliente Asaas API v3 tipado
│   ├── ezviz-sdk/
│   ├── ctrlsafe-sdk/
│   ├── shared/                            # crypto, types, utils
│   └── ui/
│
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

---

## Schema Prisma

```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────
// SUPERADMIN
// ─────────────────────────────────────

model Superadmin {
  id        String   @id @default(cuid())
  email     String   @unique
  senha     String
  nome      String
  criadoEm DateTime @default(now())
}

// ─────────────────────────────────────
// PLANOS
// ─────────────────────────────────────

model Plano {
  id              String   @id @default(cuid())
  nome            String   // "Starter", "Profissional", "Enterprise"
  descricao       String?
  pontosIncluidos Int      // pontos de Alerta Vigia incluídos
  valorMensal     Decimal  @db.Decimal(10, 2)
  valorAnual      Decimal? @db.Decimal(10, 2)
  limiteCameras   Int      @default(5)
  limiteUsuarios  Int      @default(10)
  ativo           Boolean  @default(true)
  criadoEm       DateTime @default(now())

  assinaturas Assinatura[]
}

// ─────────────────────────────────────
// TENANTS (EMPRESAS CLIENTES)
// ─────────────────────────────────────

model Tenant {
  id           String   @id @default(cuid())
  nome         String
  cnpj         String?  @unique
  email        String   @unique
  telefone     String?
  ativo        Boolean  @default(true)
  onboardingOk Boolean  @default(false)
  criadoEm   DateTime @default(now())

  // Credenciais EZVIZ do tenant (criptografadas)
  ezvizAppKey    String?
  ezvizAppSecret String?

  usuarios     Usuario[]
  pontos       Ponto[]
  cameras      Camera[]
  vigilantes   Vigilante[]
  assinatura   Assinatura?
  eventos      Evento[]
  ciclos       ConfigCiclo[]
  notifConfigs ConfigNotificacao[]
  onboarding   OnboardingStep?
}

model Usuario {
  id         String   @id @default(cuid())
  tenantId   String
  email      String   @unique
  nome       String
  papel      Papel    @default(OPERADOR)
  senha      String
  ativo      Boolean  @default(true)
  criadoEm DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

// ─────────────────────────────────────
// ASSINATURA ASAAS
// ─────────────────────────────────────

model Assinatura {
  id             String           @id @default(cuid())
  tenantId       String           @unique
  planoId        String
  periodicidade  Periodicidade    @default(MENSAL)
  status         AssinaturaStatus @default(TRIAL)

  // IDs externos Asaas
  // Customer ID: padrão "cus_XXXXXXXXXXXXXXXX"
  // Subscription ID: padrão "sub_XXXXXXXXXXXXXXXX"
  asaasCustomerId     String? @unique
  asaasSubscriptionId String? @unique

  // Referência usada no campo externalReference das subscriptions Asaas
  // Permite identificar o tenant ao receber webhooks
  externalReference String @unique @default(cuid())

  pontosContratados   Int
  proximaCobrancaEm   DateTime?
  trialAteEm          DateTime?
  canceladaEm         DateTime?
  criadoEm           DateTime    @default(now())
  atualizadoEm       DateTime    @updatedAt

  tenant    Tenant     @relation(fields: [tenantId], references: [id])
  plano     Plano      @relation(fields: [planoId], references: [id])
  cobrancas Cobranca[]
}

// Espelho das cobranças vindas via webhook Asaas
// Payment ID: padrão "pay_XXXXXXXXXXXXXXXX"
model Cobranca {
  id             String        @id @default(cuid())
  assinaturaId   String
  asaasPaymentId String        @unique   // "pay_XXXXXXXXXXXXXXXX"
  asaasEventId   String?       @unique   // ID do evento webhook (idempotência)
  valor          Decimal       @db.Decimal(10, 2)
  status         CobrancaStatus
  billingType    String        // BOLETO | PIX | CREDIT_CARD
  vencimentoEm   DateTime
  paguEm         DateTime?
  criadoEm      DateTime      @default(now())

  assinatura Assinatura @relation(fields: [assinaturaId], references: [id])
}

// ─────────────────────────────────────
// PONTOS (PORTARIAS)
// ─────────────────────────────────────

model Ponto {
  id         String   @id @default(cuid())
  tenantId   String
  nome       String
  descricao  String?
  endereco   String?
  ativo      Boolean  @default(true)
  criadoEm DateTime @default(now())

  // Canal de alerta específico do ponto (null = herda do tenant)
  canalAlerta CanalAlerta?

  // Config Contact ID para CTRL+SAFE (se canal = CTRLSAFE)
  ctrlsafeAccount   String?
  ctrlsafePartition String?
  ctrlsafeZone      String?
  ctrlsafeReceiver  String?
  ctrlsafeLine      String?

  tenant      Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  vigilantes  Vigilante[]
  cameras     Camera[]
  eventos     Evento[]
  configCiclo ConfigCiclo?
  execucoes   ExecucaoCiclo[]
}

// ─────────────────────────────────────
// VIGILANTES
// ─────────────────────────────────────

model Vigilante {
  id         String   @id @default(cuid())
  tenantId   String
  pontoId    String?
  nome       String
  telefone   String?
  rfid       String?
  ativo      Boolean  @default(true)
  criadoEm DateTime @default(now())

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  ponto  Ponto?  @relation(fields: [pontoId], references: [id])
}

// ─────────────────────────────────────
// CÂMERAS EZVIZ
// ─────────────────────────────────────

model Camera {
  id           String   @id @default(cuid())
  tenantId     String
  pontoId      String?
  deviceSerial String   // ex: "L58661369"
  deviceName   String?
  channelNo    Int      @default(1)
  ativa        Boolean  @default(true)
  criadoEm   DateTime @default(now())

  // Credenciais próprias (null = herda do tenant)
  ezvizAppKey    String?
  ezvizAppSecret String?

  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  ponto     Ponto?     @relation(fields: [pontoId], references: [id])
  snapshots Snapshot[]
}

model Snapshot {
  id         String   @id @default(cuid())
  cameraId   String
  eventoId   String?
  imageUrl   String
  criadoEm DateTime @default(now())

  camera Camera @relation(fields: [cameraId], references: [id])
}

// ─────────────────────────────────────
// CICLOS DE ALERTA
// ─────────────────────────────────────

// pontoId = null → configuração padrão do tenant
// pontoId = ID   → override específico do ponto
model ConfigCiclo {
  id                String   @id @default(cuid())
  tenantId          String
  pontoId           String?  @unique
  nome              String   @default("Padrão")

  duracaoMinutos    Int      @default(10)  // intervalo máximo entre check-ins
  toleranciaMinutos Int      @default(2)   // tempo extra antes de disparar
  avisoAntesMin     Int      @default(5)   // aviso antecipado

  codigoCheckin     String   @default("1602")
  codigoPanico      String   @default("1122")
  codigoFalha       String   @default("1130")

  capturarSnapshot  Boolean  @default(true)
  enviarAvisoWpp    Boolean  @default(true)
  autoReiniciar     Boolean  @default(true)
  ativo             Boolean  @default(true)

  criadoEm        DateTime @default(now())
  atualizadoEm    DateTime @updatedAt

  tenant    Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  ponto     Ponto?    @relation(fields: [pontoId], references: [id])
  execucoes ExecucaoCiclo[]
}

model ExecucaoCiclo {
  id           String      @id @default(cuid())
  configId     String
  pontoId      String
  iniciadoEm   DateTime    @default(now())
  expiraEm     DateTime    // iniciadoEm + duracaoMinutos + toleranciaMinutos
  finalizadoEm DateTime?
  status       CicloStatus @default(EM_ANDAMENTO)
  checkinEm    DateTime?
  alertaEm     DateTime?
  snapshotId   String?

  // IDs dos jobs BullMQ salvos para cancelamento no check-in
  avisoJobId  String?
  expiraJobId String?

  config ConfigCiclo @relation(fields: [configId], references: [id])
  ponto  Ponto       @relation(fields: [pontoId], references: [id])
}

// ─────────────────────────────────────
// EVENTOS
// ─────────────────────────────────────

model Evento {
  id          String      @id @default(cuid())
  tenantId    String
  pontoId     String?
  tipo        TipoEvento
  canal       CanalAlerta?
  encaminhado Boolean     @default(false)
  snapshotId  String?
  ocorridoEm  DateTime    @default(now())
  criadoEm   DateTime    @default(now())
  meta        Json?

  tenant Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  ponto  Ponto?  @relation(fields: [pontoId], references: [id])
}

// ─────────────────────────────────────
// NOTIFICAÇÕES
// ─────────────────────────────────────

model ConfigNotificacao {
  id       String          @id @default(cuid())
  tenantId String
  tipo     TipoNotificacao
  ativo    Boolean         @default(true)

  // WhatsApp (Evolution API)
  evolutionUrl      String?
  evolutionApiKey   String?   // criptografado AES-256-GCM
  evolutionInstance String?
  whatsappDestino   String?   // múltiplos números separados por vírgula

  // CTRL+SAFE
  ctrlsafeAgentToken String?  // criptografado AES-256-GCM
  ctrlsafeInstallId  String?

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, tipo])
}

// ─────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────

model OnboardingStep {
  id          String    @id @default(cuid())
  tenantId    String    @unique
  ponto       Boolean   @default(false)
  vigilante   Boolean   @default(false)
  ciclo       Boolean   @default(false)
  notificacao Boolean   @default(false)
  teste       Boolean   @default(false)
  concluidoEm DateTime?

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

// ─────────────────────────────────────
// ENUMS
// ─────────────────────────────────────

enum Papel            { SUPERADMIN ADMIN OPERADOR VIGILANTE }
enum Periodicidade    { MENSAL ANUAL }
enum AssinaturaStatus { TRIAL ATIVA INADIMPLENTE SUSPENSA CANCELADA }
enum CobrancaStatus   { PENDENTE CONFIRMADA RECEBIDA VENCIDA CANCELADA ESTORNADA }
enum CicloStatus      { EM_ANDAMENTO CONCLUIDO ALERTA FALHA }
enum CanalAlerta      { WHATSAPP CTRLSAFE }
enum TipoNotificacao  { WHATSAPP CTRLSAFE }
enum TipoEvento       { CHECKIN PANICO FALHA AVISO RESTAURACAO TESTE }
```

---

## SDK Asaas (`packages/asaas-sdk`)

> Baseado na documentação oficial **Asaas API v3** (docs.asaas.com).
> Autenticação: header `access_token: $aact_...` em todas as chamadas.

### Endpoints utilizados

```
Clientes:
  POST   /v3/customers                     → Criar customer
  GET    /v3/customers/:id                  → Recuperar customer
  PUT    /v3/customers/:id                  → Atualizar customer

Assinaturas recorrentes:
  POST   /v3/subscriptions                  → Criar subscription (boleto/pix/cartão)
  GET    /v3/subscriptions/:id              → Recuperar subscription
  PUT    /v3/subscriptions/:id              → Atualizar subscription (troca de plano)
  DELETE /v3/subscriptions/:id              → Remover subscription (cancela)
  GET    /v3/subscriptions/:id/payments     → Listar cobranças de uma subscription

Webhooks (configuração):
  POST   /v3/webhooks                       → Registrar endpoint de webhook
  GET    /v3/webhooks                       → Listar webhooks cadastrados
```

### Implementação

```typescript
// packages/asaas-sdk/src/client.ts

export class AsaasClient {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(private config: AsaasConfig) {
    this.baseUrl = config.sandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3'
    // Autenticação: header "access_token"
    this.headers = {
      'Content-Type': 'application/json',
      'access_token': config.apiKey   // $aact_XXXXXXXXXXXXXX
    }
  }

  // ── CUSTOMERS ──────────────────────────────────────

  async createCustomer(data: CreateCustomerInput): Promise<AsaasCustomer> {
    // POST /v3/customers
    // Retorna: { id: "cus_XXXXXXXXXXXXXXXX", name, email, cpfCnpj, ... }
  }

  async getCustomer(customerId: string): Promise<AsaasCustomer> {
    // GET /v3/customers/{customerId}
  }

  async updateCustomer(customerId: string, data: Partial<CreateCustomerInput>): Promise<AsaasCustomer> {
    // PUT /v3/customers/{customerId}
  }

  // ── SUBSCRIPTIONS ──────────────────────────────────

  async createSubscription(data: CreateSubscriptionInput): Promise<AsaasSubscription> {
    // POST /v3/subscriptions
    // Para cartão de crédito: também envia creditCard + creditCardHolderInfo
    // Retorna: { id: "sub_XXXXXXXXXXXXXXXX", status: "ACTIVE", nextDueDate, ... }
  }

  async getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
    // GET /v3/subscriptions/{subscriptionId}
  }

  async updateSubscription(subscriptionId: string, data: UpdateSubscriptionInput): Promise<AsaasSubscription> {
    // PUT /v3/subscriptions/{subscriptionId}
    // Para trocar valor/plano: passar updatePendingPayments: true
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // DELETE /v3/subscriptions/{subscriptionId}
  }

  async listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
    // GET /v3/subscriptions/{subscriptionId}/payments
  }

  // ── WEBHOOKS (setup) ────────────────────────────────

  async createWebhook(data: CreateWebhookInput): Promise<AsaasWebhook> {
    // POST /v3/webhooks
    // Configura URL do endpoint + token de validação (asaas-access-token header)
    // Máximo de 10 webhooks por conta
  }
}

// ── TIPOS ──────────────────────────────────────────────

interface AsaasConfig {
  apiKey: string        // $aact_XXXXXXXXXXXXXX
  sandbox?: boolean     // true em desenvolvimento
}

interface CreateCustomerInput {
  name: string
  email: string
  cpfCnpj?: string
  phone?: string
  mobilePhone?: string
  address?: string
  addressNumber?: string
  province?: string
  postalCode?: string
}

interface AsaasCustomer {
  id: string              // "cus_XXXXXXXXXXXXXXXX"
  name: string
  email: string
  cpfCnpj?: string
  dateCreated: string
}

interface CreateSubscriptionInput {
  customer: string          // ID do customer: "cus_XXXXXXXXXXXXXXXX"
  billingType: BillingType  // "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED"
  nextDueDate: string       // "YYYY-MM-DD" — data da primeira cobrança
  value: number             // valor em reais (ex: 299.90)
  cycle: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'BIWEEKLY' | 'QUARTERLY' | 'SEMIANNUAL'
  description: string       // descrição visível na fatura
  externalReference?: string // tenantId — para identificar no webhook

  // Apenas para billingType = "CREDIT_CARD"
  creditCard?: {
    holderName: string
    number: string
    expiryMonth: string
    expiryYear: string
    ccv: string
  }
  creditCardHolderInfo?: {
    name: string
    email: string
    cpfCnpj: string
    postalCode: string
    addressNumber: string
    phone?: string
    mobilePhone?: string
  }

  // Configurações extras
  discount?: { value: number; dueDateLimitDays: number; type: 'PERCENTAGE' | 'FIXED' }
  fine?: { value: number; type: 'PERCENTAGE' | 'FIXED' }
  interest?: { value: number; type: 'PERCENTAGE' }
}

interface UpdateSubscriptionInput {
  value?: number
  billingType?: BillingType
  cycle?: string
  nextDueDate?: string
  description?: string
  updatePendingPayments?: boolean   // true → atualiza cobranças pendentes também
}

interface AsaasSubscription {
  id: string              // "sub_XXXXXXXXXXXXXXXX"
  customer: string        // "cus_XXXXXXXXXXXXXXXX"
  billingType: BillingType
  value: number
  cycle: string
  nextDueDate: string     // "YYYY-MM-DD"
  status: 'ACTIVE' | 'INACTIVE'
  description: string
  externalReference?: string
  deleted: boolean
  dateCreated: string
}

interface AsaasPayment {
  id: string              // "pay_XXXXXXXXXXXXXXXX"
  subscription: string    // "sub_XXXXXXXXXXXXXXXX"
  customer: string        // "cus_XXXXXXXXXXXXXXXX"
  value: number
  netValue: number
  status: AsaasPaymentStatus
  billingType: BillingType
  dueDate: string
  paymentDate?: string
  description: string
  externalReference?: string
  invoiceUrl?: string
  bankSlipUrl?: string    // URL do boleto
  nossoNumero?: string
}

interface CreateWebhookInput {
  url: string             // endpoint do seu servidor
  email?: string
  apiVersion?: string
  enabled?: boolean
  interrupted?: boolean
  authToken?: string      // token enviado no header "asaas-access-token"
  events: AsaasWebhookEvent[]
}

type BillingType = 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED'
type AsaasPaymentStatus =
  | 'PENDING'    // aguardando pagamento
  | 'RECEIVED'   // recebida (saldo disponível)
  | 'CONFIRMED'  // confirmada (saldo ainda não disponível)
  | 'OVERDUE'    // vencida
  | 'REFUNDED'   // estornada
  | 'CANCELED'   // cancelada

type AsaasWebhookEvent =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_CANCELED'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_UPDATED'
  | 'SUBSCRIPTION_INACTIVATED'
  | 'SUBSCRIPTION_DELETED'
```

---

## Webhook Asaas → Handler

> O Asaas envia `POST` para o seu endpoint com um JSON contendo `event` + objeto completo.
> Autenticação: validar header `asaas-access-token` em cada requisição.
> Responder `HTTP 200` imediatamente — processar de forma assíncrona via fila BullMQ.
> **Idempotência obrigatória:** usar o campo `id` do evento webhook para evitar reprocessamento.
> Após 15 falhas consecutivas de resposta 200, o Asaas pausa a fila (events ficam 14 dias disponíveis).

```typescript
// apps/api/src/modules/assinaturas/webhook.handler.ts

// POST /webhooks/asaas
// Header validado: asaas-access-token === ASAAS_WEBHOOK_TOKEN (env)

interface AsaasWebhookPayload {
  id: string          // "evt_XXXXXXXXXXXXXXXXXXXXXX&XXXXXXXXX" — ID único do evento
  event: AsaasWebhookEvent
  dateCreated: string // "2024-06-12 16:45:03"

  // Um dos dois estará presente, dependendo do evento
  payment?: AsaasPayment
  subscription?: AsaasSubscription
}

// Eventos de PAGAMENTO relevantes para o sistema:
//
// Fluxo Boleto (sem atraso):
//   PAYMENT_CREATED → PAYMENT_CONFIRMED → PAYMENT_RECEIVED
//
// Fluxo Boleto (com atraso):
//   PAYMENT_CREATED → PAYMENT_OVERDUE → PAYMENT_CONFIRMED → PAYMENT_RECEIVED
//
// Fluxo Pix (sem atraso):
//   PAYMENT_CREATED → PAYMENT_RECEIVED
//
// Fluxo Cartão (sem atraso):
//   PAYMENT_CREATED → PAYMENT_CONFIRMED → PAYMENT_RECEIVED (30 dias após CONFIRMED)

export const WEBHOOK_HANDLERS: Record<string, (payload: AsaasWebhookPayload) => Promise<void>> = {

  // Cobrança confirmada — saldo a caminho (ainda não disponível)
  // Para cartão: confirma o pagamento imediatamente
  // Para boleto: confirma o pagamento (saldo liberado em D+1 ou D+2)
  'PAYMENT_CONFIRMED': async ({ payment, id }) => {
    if (!payment?.subscription) return
    await idempotente(id, async () => {
      await prisma.assinatura.update({
        where: { asaasSubscriptionId: payment.subscription! },
        data: { status: 'ATIVA', proximaCobrancaEm: new Date(payment.dueDate) }
      })
      await upsertCobranca(payment, 'CONFIRMADA')
    })
  },

  // Cobrança efetivamente recebida — saldo disponível na conta Asaas
  'PAYMENT_RECEIVED': async ({ payment, id }) => {
    if (!payment?.subscription) return
    await idempotente(id, async () => {
      await upsertCobranca(payment, 'RECEBIDA')
    })
  },

  // Cobrança venceu sem pagamento — marcar inadimplente (não bloquear imediatamente)
  'PAYMENT_OVERDUE': async ({ payment, id }) => {
    if (!payment?.subscription) return
    await idempotente(id, async () => {
      await prisma.assinatura.update({
        where: { asaasSubscriptionId: payment.subscription! },
        data: { status: 'INADIMPLENTE' }
      })
      await upsertCobranca(payment, 'VENCIDA')
      // Enviar e-mail de aviso ao tenant
      await enviarEmailInadimplencia(payment.subscription!)
    })
  },

  // Cobrança cancelada
  'PAYMENT_CANCELED': async ({ payment, id }) => {
    if (!payment?.subscription) return
    await idempotente(id, async () => {
      await upsertCobranca(payment, 'CANCELADA')
    })
  },

  // Assinatura inativada no Asaas
  'SUBSCRIPTION_INACTIVATED': async ({ subscription, id }) => {
    if (!subscription) return
    await idempotente(id, async () => {
      await prisma.assinatura.update({
        where: { asaasSubscriptionId: subscription.id },
        data: { status: 'SUSPENSA' }
      })
    })
  },

  // Assinatura removida no Asaas — cancelamento definitivo
  'SUBSCRIPTION_DELETED': async ({ subscription, id }) => {
    if (!subscription) return
    await idempotente(id, async () => {
      await prisma.assinatura.update({
        where: { asaasSubscriptionId: subscription.id },
        data: { status: 'CANCELADA', canceladaEm: new Date() }
      })
    })
  },
}

// Idempotência: ignorar evento se já processado (usa asaasEventId na tabela Cobranca)
async function idempotente(eventId: string, fn: () => Promise<void>): Promise<void> {
  const jaProcessado = await prisma.cobranca.findUnique({
    where: { asaasEventId: eventId }
  })
  if (jaProcessado) return  // já processado, ignorar
  await fn()
}

async function upsertCobranca(payment: AsaasPayment, status: CobrancaStatus): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({
    where: { asaasSubscriptionId: payment.subscription! }
  })
  if (!assinatura) return

  await prisma.cobranca.upsert({
    where: { asaasPaymentId: payment.id },
    update: { status, paguEm: payment.paymentDate ? new Date(payment.paymentDate) : null },
    create: {
      assinaturaId: assinatura.id,
      asaasPaymentId: payment.id,
      asaasEventId: null,   // preenchido na primeira ocorrência do evento
      valor: payment.value,
      billingType: payment.billingType,
      status,
      vencimentoEm: new Date(payment.dueDate),
      paguEm: payment.paymentDate ? new Date(payment.paymentDate) : null,
    }
  })
}
```

---

## Módulo de Assinaturas — Fluxo Completo

```typescript
// apps/api/src/modules/assinaturas/assinatura.service.ts

// ── CRIAR ASSINATURA (chamado pelo superadmin) ──────────────────────────────

async function criarAssinatura(
  tenantId: string,
  planoId: string,
  opcoes: {
    periodicidade: 'MENSAL' | 'ANUAL',
    billingType: BillingType,
    nextDueDate: string,       // "YYYY-MM-DD"
    trialDias?: number         // ex: 14 → cliente não paga por 14 dias
  }
): Promise<Assinatura> {

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  const plano = await prisma.plano.findUnique({ where: { id: planoId } })

  // 1. Criar customer no Asaas (se ainda não existe)
  let customerId = (await prisma.assinatura.findUnique({ where: { tenantId } }))?.asaasCustomerId

  if (!customerId) {
    const customer = await asaas.createCustomer({
      name: tenant!.nome,
      email: tenant!.email,
      cpfCnpj: tenant!.cnpj ?? undefined,
      phone: tenant!.telefone ?? undefined,
    })
    customerId = customer.id  // "cus_XXXXXXXXXXXXXXXX"
  }

  // 2. Calcular data da primeira cobrança (considerando trial)
  const primeiraCobranca = opcoes.trialDias
    ? format(addDays(new Date(), opcoes.trialDias), 'yyyy-MM-dd')
    : opcoes.nextDueDate

  // 3. Calcular valor (mensal ou anual)
  const valor = opcoes.periodicidade === 'ANUAL'
    ? Number(plano!.valorAnual ?? plano!.valorMensal * 12)
    : Number(plano!.valorMensal)

  const cycle = opcoes.periodicidade === 'ANUAL' ? 'YEARLY' : 'MONTHLY'

  // 4. Criar subscription no Asaas
  // externalReference = tenantId → permite identificar o tenant nos webhooks
  const subscription = await asaas.createSubscription({
    customer: customerId,
    billingType: opcoes.billingType,
    nextDueDate: primeiraCobranca,
    value: valor,
    cycle,
    description: `Alerta Vigia — Plano ${plano!.nome} (${cycle === 'YEARLY' ? 'Anual' : 'Mensal'})`,
    externalReference: tenantId,   // ← chave para identificar no webhook
  })

  // 5. Salvar no banco
  return prisma.assinatura.upsert({
    where: { tenantId },
    update: {
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription.id,
      planoId,
      periodicidade: opcoes.periodicidade,
      status: opcoes.trialDias ? 'TRIAL' : 'ATIVA',
      pontosContratados: plano!.pontosIncluidos,
      trialAteEm: opcoes.trialDias ? addDays(new Date(), opcoes.trialDias) : null,
      proximaCobrancaEm: new Date(subscription.nextDueDate),
    },
    create: {
      tenantId,
      planoId,
      periodicidade: opcoes.periodicidade,
      status: opcoes.trialDias ? 'TRIAL' : 'ATIVA',
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription.id,
      pontosContratados: plano!.pontosIncluidos,
      trialAteEm: opcoes.trialDias ? addDays(new Date(), opcoes.trialDias) : null,
      proximaCobrancaEm: new Date(subscription.nextDueDate),
    }
  })
}

// ── UPGRADE DE PLANO ────────────────────────────────────────────────────────

async function upgradePlano(tenantId: string, novoPlanoId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { tenantId }, include: { plano: true } })
  const novoPlano = await prisma.plano.findUnique({ where: { id: novoPlanoId } })

  // Atualizar subscription no Asaas
  // updatePendingPayments: true → cobranças pendentes refletem o novo valor
  await asaas.updateSubscription(assinatura!.asaasSubscriptionId!, {
    value: Number(novoPlano!.valorMensal),
    description: `Alerta Vigia — Plano ${novoPlano!.nome}`,
    updatePendingPayments: true,
  })

  await prisma.assinatura.update({
    where: { tenantId },
    data: {
      planoId: novoPlanoId,
      pontosContratados: novoPlano!.pontosIncluidos,
    }
  })
}

// ── CANCELAR ASSINATURA ─────────────────────────────────────────────────────

async function cancelarAssinatura(tenantId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { tenantId } })

  // DELETE /v3/subscriptions/{id} — cancela no Asaas
  await asaas.cancelSubscription(assinatura!.asaasSubscriptionId!)

  // O webhook SUBSCRIPTION_DELETED atualizará o status para CANCELADA
  // (processamento assíncrono garantido pelo webhook handler)
}

// ── SYNC PERIÓDICO (failsafe do webhook) ────────────────────────────────────

// Job BullMQ: roda a cada 6h
// Verifica no Asaas o status real de cada assinatura ativa
// Corrige divergências que o webhook pode ter perdido
async function syncAssinaturas(): Promise<void> {
  const assinaturas = await prisma.assinatura.findMany({
    where: { status: { in: ['ATIVA', 'TRIAL', 'INADIMPLENTE'] } }
  })

  for (const assinatura of assinaturas) {
    if (!assinatura.asaasSubscriptionId) continue
    const sub = await asaas.getSubscription(assinatura.asaasSubscriptionId)

    if (sub.deleted) {
      await prisma.assinatura.update({
        where: { id: assinatura.id },
        data: { status: 'CANCELADA' }
      })
    } else if (sub.status === 'INACTIVE' && assinatura.status === 'ATIVA') {
      await prisma.assinatura.update({
        where: { id: assinatura.id },
        data: { status: 'SUSPENSA' }
      })
    }
  }
}
```

---

## Middleware de Acesso por Assinatura

```typescript
// apps/api/src/middleware/assinatura.middleware.ts

// Injetado em TODAS as rotas do tenant (exceto /auth e /webhooks)
export async function verificarAssinatura(tenantId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { tenantId } })

  if (!assinatura) {
    throw new SemAssinaturaError('Nenhuma assinatura encontrada')
  }

  if (assinatura.status === 'CANCELADA') {
    throw new AssinaturaCanceladaError('Assinatura cancelada')
  }

  // TRIAL expirado sem pagamento → bloquear
  if (assinatura.status === 'TRIAL' && assinatura.trialAteEm && assinatura.trialAteEm < new Date()) {
    throw new TrialExpiradoError('Período de trial expirado. Aguardando pagamento.')
  }

  // INADIMPLENTE → acesso degradado (somente leitura, sem novos pontos)
  // Não bloquear completamente — avisar no painel
}

// Verificação de limite ao criar novo ponto
export async function verificarLimitePontos(tenantId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { tenantId } })
  if (!assinatura || assinatura.status === 'CANCELADA') throw new SemAssinaturaError()

  const pontosAtivos = await prisma.ponto.count({ where: { tenantId, ativo: true } })

  if (pontosAtivos >= assinatura.pontosContratados) {
    throw new LimitePontosError(
      `Limite de ${assinatura.pontosContratados} pontos atingido. Solicite upgrade do plano.`
    )
  }
}
```

---

## Endpoints da API

```
── SUPERADMIN ──────────────────────────────────────────────────────────────────
POST   /superadmin/clientes                               Criar empresa
GET    /superadmin/clientes                               Listar (filtros: status, plano)
GET    /superadmin/clientes/:id                           Detalhe
PUT    /superadmin/clientes/:id                           Editar
POST   /superadmin/clientes/:id/assinatura                Criar assinatura Asaas
PUT    /superadmin/clientes/:id/assinatura/upgrade        Trocar plano
DELETE /superadmin/clientes/:id/assinatura                Cancelar subscription
GET    /superadmin/clientes/:id/assinatura/cobrancas      Listar cobranças
GET    /superadmin/planos                                 Listar planos
POST   /superadmin/planos                                 Criar plano
PUT    /superadmin/planos/:id                             Editar plano
GET    /superadmin/overview                               Métricas globais

── WEBHOOKS ────────────────────────────────────────────────────────────────────
POST   /webhooks/asaas                                    Receber eventos Asaas
       Header: asaas-access-token validado
       Resposta: HTTP 200 imediato, processamento assíncrono via BullMQ

── AUTH ────────────────────────────────────────────────────────────────────────
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/esqueci-senha
POST   /auth/redefinir-senha

── PLANO (tenant) ──────────────────────────────────────────────────────────────
GET    /plano                                             Status e próxima renovação
GET    /plano/cobrancas                                   Histórico de cobranças (últimas 6)

── ONBOARDING ──────────────────────────────────────────────────────────────────
GET    /onboarding
PUT    /onboarding/:step

── PONTOS ──────────────────────────────────────────────────────────────────────
GET    /pontos
POST   /pontos                                            Verifica limite do plano
GET    /pontos/:id
PUT    /pontos/:id
DELETE /pontos/:id
GET    /pontos/:id/status                                 Status em tempo real

── CICLOS ──────────────────────────────────────────────────────────────────────
GET    /ciclo/padrao                                      Config padrão do tenant
PUT    /ciclo/padrao
GET    /pontos/:id/ciclo                                  Config do ponto (ou herança)
PUT    /pontos/:id/ciclo
DELETE /pontos/:id/ciclo                                  Remove override
POST   /pontos/:id/ciclo/iniciar
POST   /checkin                                           { pontoId, vigilanteId? }
GET    /pontos/:id/execucoes

── CÂMERAS ─────────────────────────────────────────────────────────────────────
GET    /cameras
POST   /cameras
GET    /cameras/:id/live
POST   /cameras/:id/snapshot
GET    /cameras/:id/snapshots
DELETE /cameras/:id

── CONFIGURAÇÕES ───────────────────────────────────────────────────────────────
GET    /config/notificacoes
PUT    /config/notificacoes/whatsapp
PUT    /config/notificacoes/ctrlsafe
POST   /config/notificacoes/testar
PUT    /config/ezviz
POST   /config/ezviz/testar

── EVENTOS ─────────────────────────────────────────────────────────────────────
GET    /eventos                                           Feed com filtros e paginação
GET    /eventos/stats

── RELATÓRIOS ──────────────────────────────────────────────────────────────────
GET    /relatorios/checkins
GET    /relatorios/alertas
GET    /relatorios/performance
GET    /relatorios/resumo                                 PDF executivo
```

---

## Configurações de Ambiente

```env
# .env.example

NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/alertavigia

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=min-32-chars-here-xxxxxxxxxxxxxxx
JWT_REFRESH_SECRET=min-32-chars-here-yyyyyyy
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Criptografia AES-256-GCM (para secrets no banco)
ENCRYPTION_KEY=exactly-32-chars-for-aes256key!

# ── ASAAS ────────────────────────────────────────────────────────────────────
# Chave da API: começa com $aact_
ASAAS_API_KEY=$aact_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
# Usar sandbox em desenvolvimento (true/false)
ASAAS_SANDBOX=true
# URLs (automático baseado em ASAAS_SANDBOX):
# Produção:  https://api.asaas.com/v3
# Sandbox:   https://sandbox.asaas.com/api/v3
# Token enviado no header "asaas-access-token" pelo Asaas nos webhooks
ASAAS_WEBHOOK_TOKEN=seu-token-seguro-de-validacao-do-webhook

# ── CTRL+SAFE (canal de saída) ───────────────────────────────────────────────
CTRLSAFE_API_URL=https://api.ctrlsafe.com.br/api/functions/v1

# ── EZVIZ (credenciais fallback — sobrescrito por tenant no banco) ────────────
EZVIZ_AUTH_URL=https://open.ezvizlife.com
EZVIZ_API_URL=https://isaopen.ezvizlife.com

# ── E-MAIL ───────────────────────────────────────────────────────────────────
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxxxxxxxxxxxxx
EMAIL_FROM=noreply@alertavigia.com.br

# ── SUPERADMIN INICIAL (seed) ─────────────────────────────────────────────────
SUPERADMIN_EMAIL=admin@alertavigia.com.br
SUPERADMIN_SENHA=troque-imediatamente-em-producao
```

---

## Docker Compose

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: alertavigia
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@alertavigia.com.br
      PGADMIN_DEFAULT_PASSWORD: admin
    ports: ["5050:80"]
    depends_on: [postgres]

volumes:
  postgres_data:
```

---

## Checklist de Implementação

### Asaas
- [ ] Header de autenticação: `access_token: $aact_...` (não `Authorization: Bearer`)
- [ ] Sandbox em dev: `https://sandbox.asaas.com/api/v3`
- [ ] Produção: `https://api.asaas.com/v3`
- [ ] Webhook: validar `asaas-access-token` header antes de processar
- [ ] Webhook: responder HTTP 200 imediatamente (processamento assíncrono)
- [ ] Webhook: idempotência por `evt.id` — ignorar eventos já processados
- [ ] Webhook: registrar endpoint via `POST /v3/webhooks` no setup inicial
- [ ] Subscription: usar `externalReference = tenantId` para identificar o tenant nos webhooks
- [ ] Upgrade de plano: passar `updatePendingPayments: true` para atualizar cobranças pendentes
- [ ] Job de sync a cada 6h como failsafe do webhook
- [ ] Trial: usar `nextDueDate` no futuro para criar subscription sem cobrar agora

### Multi-tenancy e acesso
- [ ] Middleware verifica `assinatura.status` em todas as rotas do tenant
- [ ] `verificarLimitePontos()` chamado no `POST /pontos`
- [ ] Inadimplente: acesso de leitura mantido, criação de pontos bloqueada + banner de aviso
- [ ] Trial expirado sem pagamento: bloquear completamente com mensagem clara

### Segurança
- [ ] Todos os secrets no banco criptografados com AES-256-GCM
- [ ] Row-Level Security via middleware Prisma (todos os queries filtram `tenantId`)
- [ ] Rotas `/superadmin/*` requerem claim `role: superadmin` no JWT
- [ ] Rate limiting: 100 req/min por tenant, 10 req/min para `/checkin`

---

## Referência Rápida Asaas

| Recurso | Endpoint | Método |
|---|---|---|
| Criar customer | `/v3/customers` | POST |
| Criar subscription | `/v3/subscriptions` | POST |
| Atualizar subscription | `/v3/subscriptions/:id` | PUT |
| Cancelar subscription | `/v3/subscriptions/:id` | DELETE |
| Listar cobranças da sub | `/v3/subscriptions/:id/payments` | GET |
| Registrar webhook | `/v3/webhooks` | POST |

| Evento Webhook | Quando ocorre | Ação no sistema |
|---|---|---|
| `PAYMENT_CONFIRMED` | Pagamento confirmado (saldo a caminho) | Status → ATIVA |
| `PAYMENT_RECEIVED` | Saldo efetivamente disponível | Atualizar cobrança → RECEBIDA |
| `PAYMENT_OVERDUE` | Cobrança venceu sem pagar | Status → INADIMPLENTE |
| `PAYMENT_CANCELED` | Cobrança cancelada | Atualizar cobrança → CANCELADA |
| `SUBSCRIPTION_INACTIVATED` | Assinatura inativada no Asaas | Status → SUSPENSA |
| `SUBSCRIPTION_DELETED` | Assinatura removida no Asaas | Status → CANCELADA |

| ID Pattern Asaas | Exemplo |
|---|---|
| Customer | `cus_XXXXXXXXXXXXXXXX` |
| Subscription | `sub_XXXXXXXXXXXXXXXX` |
| Payment | `pay_XXXXXXXXXXXXXXXX` |
| Webhook Event | `evt_XXXXXXXXXXXXXX&XXXXXXXXX` |

---

## Entregáveis Esperados

1. `turbo.json` + `pnpm-workspace.yaml`
2. `packages/database/prisma/schema.prisma`
3. `packages/asaas-sdk/src/` — cliente completo, tipos, erros
4. `packages/ezviz-sdk/src/` — cliente com auto-refresh de token
5. `packages/ctrlsafe-sdk/src/` — cliente de envio de eventos
6. `packages/shared/src/crypto.ts` — encrypt/decrypt AES-256-GCM
7. `apps/api/src/modules/assinaturas/assinatura.service.ts`
8. `apps/api/src/modules/assinaturas/webhook.handler.ts`
9. `apps/api/src/middleware/assinatura.middleware.ts`
10. `apps/api/src/jobs/assinatura-sync.job.ts`
11. `apps/api/src/modules/superadmin/` — clientes + assinaturas
12. `apps/api/src/modules/pontos/` — CRUD + limite
13. `apps/api/src/modules/ciclos/` — config com herança
14. `apps/api/src/modules/notificacoes/dispatcher.ts`
15. `apps/api/src/jobs/ciclo-alerta.job.ts`
16. `apps/web/app/(superadmin)/clientes/novo/page.tsx`
17. `apps/web/app/(dashboard)/onboarding/page.tsx`
18. `apps/web/app/(dashboard)/pontos/page.tsx`
19. `apps/web/app/(dashboard)/pontos/[id]/ciclo/page.tsx`
20. `apps/web/app/(dashboard)/plano/page.tsx`
21. `docker-compose.yml` + `.env.example`
22. `README.md`
