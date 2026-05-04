import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '@alerta-vigia/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import {
  getEvoGoServerConfig,
  buildInstanceName,
  createInstance,
  connectInstance,
  getInstanceQR,
  getInstanceStatus,
  listGroups,
  logoutInstance,
  deleteInstance,
} from '../../infra/evogo/evogo.service.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getWppCfg(tenantId: string) {
  return prisma.configNotificacao.findFirst({
    where: { tenantId, tipo: 'WHATSAPP' },
    select: {
      evolutionUrl: true,
      evolutionApiKey: true,
      evolutionInstance: true,
      evolutionInstanceToken: true,
      whatsappInstStatus: true,
      whatsappGrupoJid: true,
      whatsappGrupoNome: true,
    },
  })
}

function serverFromCfg(cfg: { evolutionUrl: string | null; evolutionApiKey: string | null }) {
  if (!cfg.evolutionUrl || !cfg.evolutionApiKey) return null
  return { url: cfg.evolutionUrl, apiKey: cfg.evolutionApiKey }
}

// ─── rotas ───────────────────────────────────────────────────────────────────

export async function notificacoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ── GET — config completa ─────────────────────────────────────────────────
  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    return prisma.configNotificacao.findMany({ where: { tenantId } })
  })

  // ── PUT — atualizar destino / eventos / toggle WhatsApp ───────────────────
  app.put('/whatsapp', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as {
      ativo?: boolean
      whatsappDestino?: string
      whatsappEventos?: string[]
    }
    return prisma.configNotificacao.upsert({
      where: { tenantId_tipo: { tenantId, tipo: 'WHATSAPP' } },
      update: body,
      create: { tenantId, tipo: 'WHATSAPP', ...body },
    })
  })

  // ── PUT — CTRL+SAFE ───────────────────────────────────────────────────────
  app.put('/ctrlsafe', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as { ctrlsafeAgentToken: string; ctrlsafeInstallId: string }
    return prisma.configNotificacao.upsert({
      where: { tenantId_tipo: { tenantId, tipo: 'CTRLSAFE' } },
      update: body,
      create: { tenantId, tipo: 'CTRLSAFE', ...body },
    })
  })

  // ════════════════════════════════════════════════════════════════════════════
  // Gestão de instância WhatsApp por tenant
  // ════════════════════════════════════════════════════════════════════════════

  // ── POST /whatsapp/instancia — criar instância no EvoGo ──────────────────
  app.post('/whatsapp/instancia', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }

    const server = getEvoGoServerConfig()
    if (!server) return reply.status(503).send({ error: 'Servidor WhatsApp não configurado no servidor.' })

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nome: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Tenant não encontrado.' })

    // Se já existe instância, retorna sem recriar
    const existing = await getWppCfg(tenantId)
    if (existing?.evolutionInstance) {
      return {
        instanceName: existing.evolutionInstance,
        status: existing.whatsappInstStatus ?? 'DESCONECTADO',
        jaExistia: true,
      }
    }

    const instanceName = buildInstanceName(tenant.nome)
    const token        = randomUUID()

    await createInstance(server, instanceName, token)

    await prisma.configNotificacao.upsert({
      where:  { tenantId_tipo: { tenantId, tipo: 'WHATSAPP' } },
      update: {
        evolutionUrl:           server.url,
        evolutionApiKey:        server.apiKey,
        evolutionInstance:      instanceName,
        evolutionInstanceToken: token,
        whatsappInstStatus:     'DESCONECTADO',
      },
      create: {
        tenantId,
        tipo:                   'WHATSAPP',
        ativo:                  false,
        whatsappEventos:        [],
        evolutionUrl:           server.url,
        evolutionApiKey:        server.apiKey,
        evolutionInstance:      instanceName,
        evolutionInstanceToken: token,
        whatsappInstStatus:     'DESCONECTADO',
      },
    })

    return { instanceName, status: 'DESCONECTADO', jaExistia: false }
  })

  // ── POST /whatsapp/conectar — iniciar conexão e obter QR ──────────────────
  app.post('/whatsapp/conectar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }

    const cfg = await getWppCfg(tenantId)
    if (!cfg?.evolutionInstance) {
      return reply.status(400).send({ error: 'Instância não criada. Chame POST /whatsapp/instancia primeiro.' })
    }

    const server = serverFromCfg(cfg)
    if (!server) return reply.status(503).send({ error: 'Config de servidor incompleta.' })

    const qrData = await connectInstance(server, cfg.evolutionInstance)

    await prisma.configNotificacao.updateMany({
      where: { tenantId, tipo: 'WHATSAPP' },
      data:  { whatsappInstStatus: 'AGUARDANDO_QR' },
    })

    return { status: 'AGUARDANDO_QR', ...qrData }
  })

  // ── GET /whatsapp/qr — buscar QR code atual ───────────────────────────────
  app.get('/whatsapp/qr', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }

    const cfg = await getWppCfg(tenantId)
    if (!cfg?.evolutionInstance) {
      return reply.status(400).send({ error: 'Instância não configurada.' })
    }

    const server = serverFromCfg(cfg)
    if (!server) return reply.status(503).send({ error: 'Config de servidor incompleta.' })

    const qrData = await getInstanceQR(server, cfg.evolutionInstance)
    return qrData
  })

  // ── GET /whatsapp/status — status da conexão ──────────────────────────────
  app.get('/whatsapp/status', async (request) => {
    const { tenantId } = request.user as { tenantId: string }

    const cfg = await getWppCfg(tenantId)
    if (!cfg?.evolutionInstance) {
      return { status: 'SEM_INSTANCIA' }
    }

    const server = serverFromCfg(cfg)
    if (!server) return { status: cfg.whatsappInstStatus ?? 'DESCONECTADO' }

    try {
      const statusData = await getInstanceStatus(server, cfg.evolutionInstance)
      const conectado  = statusData.state === 'open' || statusData.state === 'connected'
      const novoStatus = conectado ? 'CONECTADO' : (cfg.whatsappInstStatus ?? 'DESCONECTADO')

      if (conectado && cfg.whatsappInstStatus !== 'CONECTADO') {
        await prisma.configNotificacao.updateMany({
          where: { tenantId, tipo: 'WHATSAPP' },
          data:  { whatsappInstStatus: 'CONECTADO', ativo: true },
        })
      }

      return {
        status:       novoStatus,
        state:        statusData.state,
        grupoJid:     cfg.whatsappGrupoJid ?? null,
        grupoNome:    cfg.whatsappGrupoNome ?? null,
      }
    } catch {
      return {
        status:    cfg.whatsappInstStatus ?? 'DESCONECTADO',
        grupoJid:  cfg.whatsappGrupoJid  ?? null,
        grupoNome: cfg.whatsappGrupoNome ?? null,
      }
    }
  })

  // ── GET /whatsapp/grupos — listar grupos do WhatsApp conectado ────────────
  app.get('/whatsapp/grupos', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }

    const cfg = await getWppCfg(tenantId)
    if (!cfg?.evolutionInstance) {
      return reply.status(400).send({ error: 'Instância não configurada.' })
    }
    if (cfg.whatsappInstStatus !== 'CONECTADO') {
      return reply.status(400).send({ error: 'WhatsApp não está conectado. Conecte primeiro.' })
    }

    const server = serverFromCfg(cfg)
    if (!server) return reply.status(503).send({ error: 'Config de servidor incompleta.' })

    const grupos = await listGroups(server, cfg.evolutionInstance)
    return grupos
  })

  // ── PUT /whatsapp/grupo — vincular grupo para notificações ────────────────
  app.put('/whatsapp/grupo', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { grupoJid, grupoNome } = request.body as { grupoJid: string; grupoNome?: string }

    if (!grupoJid) return reply.status(400).send({ error: 'grupoJid é obrigatório.' })

    await prisma.configNotificacao.updateMany({
      where: { tenantId, tipo: 'WHATSAPP' },
      data:  { whatsappGrupoJid: grupoJid, whatsappGrupoNome: grupoNome ?? null },
    })

    return { ok: true, grupoJid, grupoNome: grupoNome ?? null }
  })

  // ── DELETE /whatsapp/grupo — desvincular grupo ────────────────────────────
  app.delete('/whatsapp/grupo', async (request) => {
    const { tenantId } = request.user as { tenantId: string }

    await prisma.configNotificacao.updateMany({
      where: { tenantId, tipo: 'WHATSAPP' },
      data:  { whatsappGrupoJid: null, whatsappGrupoNome: null },
    })

    return { ok: true }
  })

  // ── DELETE /whatsapp/instancia — desconectar e remover instância ──────────
  app.delete('/whatsapp/instancia', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }

    const cfg = await getWppCfg(tenantId)
    if (!cfg?.evolutionInstance) {
      return reply.status(400).send({ error: 'Instância não encontrada.' })
    }

    const server = serverFromCfg(cfg)
    if (server) {
      await logoutInstance(server, cfg.evolutionInstance).catch(() => {})
      await deleteInstance(server, cfg.evolutionInstance).catch(() => {})
    }

    await prisma.configNotificacao.updateMany({
      where: { tenantId, tipo: 'WHATSAPP' },
      data:  {
        evolutionInstance:      null,
        evolutionInstanceToken: null,
        whatsappInstStatus:     'DESCONECTADO',
        whatsappGrupoJid:       null,
        whatsappGrupoNome:      null,
        ativo:                  false,
      },
    })

    return { ok: true }
  })

  // ── POST /whatsapp/reconectar — reconectar sem recriar instância ──────────
  app.post('/whatsapp/reconectar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }

    const cfg = await getWppCfg(tenantId)
    if (!cfg?.evolutionInstance) {
      return reply.status(400).send({ error: 'Instância não criada.' })
    }

    const server = serverFromCfg(cfg)
    if (!server) return reply.status(503).send({ error: 'Config de servidor incompleta.' })

    const qrData = await connectInstance(server, cfg.evolutionInstance)

    await prisma.configNotificacao.updateMany({
      where: { tenantId, tipo: 'WHATSAPP' },
      data:  { whatsappInstStatus: 'AGUARDANDO_QR' },
    })

    return { status: 'AGUARDANDO_QR', ...qrData }
  })
}
