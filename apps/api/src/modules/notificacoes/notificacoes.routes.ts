import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import {
  getEvoGoServerConfig,
  buildInstanceName,
  createInstance,
  connectInstance,
  getInstanceQR,
  getInstanceStatus,
  listGroups,
  listInstances,
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

function instanceServersFromCfg(cfg: {
  evolutionUrl: string | null
  evolutionApiKey: string | null
  evolutionInstanceToken: string | null
}) {
  if (!cfg.evolutionUrl) return []
  const list = [
    cfg.evolutionApiKey ? { url: cfg.evolutionUrl, apiKey: cfg.evolutionApiKey } : null,
    cfg.evolutionInstanceToken ? { url: cfg.evolutionUrl, apiKey: cfg.evolutionInstanceToken } : null,
  ].filter(Boolean) as Array<{ url: string; apiKey: string }>

  const seen = new Set<string>()
  return list.filter(s => {
    const key = `${s.url}|${s.apiKey}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function tryWithServers<T>(
  servers: Array<{ url: string; apiKey: string }>,
  fn: (server: { url: string; apiKey: string }) => Promise<T>,
) {
  let lastErr: unknown = null
  for (const server of servers) {
    try {
      return await fn(server)
    } catch (err) {
      const msg = String(err)
      const authErr = msg.includes('401') || msg.includes('403') || msg.includes('not authorized')
      if (!authErr) throw err
      lastErr = err
    }
  }
  throw lastErr ?? new Error('Falha ao autenticar no servidor WhatsApp.')
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

  // ── PUT — CTRL+SAFE toggle ────────────────────────────────────────────────
  app.put('/ctrlsafe', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const { ativo } = request.body as { ativo: boolean }
    return prisma.configNotificacao.upsert({
      where:  { tenantId_tipo: { tenantId, tipo: 'CTRLSAFE' } },
      update: { ativo },
      create: { tenantId, tipo: 'CTRLSAFE', ativo },
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

    const instanceName = buildInstanceName(tenant.nome, tenantId)
    let token: string = randomUUID()

    try {
      await createInstance(server, instanceName, token)
    } catch (err) {
      const msg = String(err)
      if (!msg.includes('already exists')) throw err

      await logoutInstance(server, instanceName).catch(() => {})
      await deleteInstance(server, instanceName).catch(() => {})

      token = randomUUID()
      try {
        await createInstance(server, instanceName, token)
      } catch (err2) {
        const msg2 = String(err2)
        if (!msg2.includes('already exists')) throw err2
        const all = await listInstances(server)
        const existing = all.find(i => i.name === instanceName)
        if (!existing) throw err2
        token = existing.token
      }
    }

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

    const servers = instanceServersFromCfg(cfg)
    if (servers.length === 0) return reply.status(503).send({ error: 'Config de servidor incompleta.' })

    const qrData = await tryWithServers(servers, s => connectInstance(s, cfg.evolutionInstance!))

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

    const servers = instanceServersFromCfg(cfg)
    if (servers.length === 0) return reply.status(503).send({ error: 'Config de servidor incompleta.' })

    return tryWithServers(servers, s => getInstanceQR(s, cfg.evolutionInstance!))
  })

  // ── GET /whatsapp/status — status da conexão ──────────────────────────────
  app.get('/whatsapp/status', async (request) => {
    const { tenantId } = request.user as { tenantId: string }

    const cfg = await getWppCfg(tenantId)
    if (!cfg?.evolutionInstance) {
      return { status: 'SEM_INSTANCIA' }
    }

    const servers = instanceServersFromCfg(cfg)
    if (servers.length === 0) return { status: cfg.whatsappInstStatus ?? 'DESCONECTADO' }

    try {
      const statusData = await tryWithServers(servers, s => getInstanceStatus(s, cfg.evolutionInstance!))
      const conectado  = statusData.connected ?? (statusData.state === 'open' || statusData.state === 'connected')
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
    } catch (err) {
      // 401/404 = instância não existe mais no EvoGo → atualiza DB
      const msg = String(err)
      if (msg.includes('401') || msg.includes('404') || msg.includes('not authorized')) {
        await prisma.configNotificacao.updateMany({
          where: { tenantId, tipo: 'WHATSAPP' },
          data:  { whatsappInstStatus: 'DESCONECTADO' },
        }).catch(() => {})
        return { status: 'DESCONECTADO', grupoJid: cfg.whatsappGrupoJid ?? null, grupoNome: cfg.whatsappGrupoNome ?? null }
      }
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

    const servers = instanceServersFromCfg(cfg)
    if (servers.length === 0) return reply.status(503).send({ error: 'Config de servidor incompleta.' })

    try {
      return await tryWithServers(servers, s => listGroups(s, cfg.evolutionInstance!))
    } catch (err) {
      const msg = String(err)
      const rateLimited = msg.includes('rate-overlimit') || msg.includes('429')
      if (rateLimited) {
        return reply.status(429).send({ error: 'Servidor WhatsApp limitou as consultas. Aguarde alguns segundos e tente novamente.' })
      }
      throw err
    }
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

    // Tenta limpar no EvoGo mesmo que a instância não exista (erros ignorados)
    if (cfg?.evolutionInstance) {
      const server = serverFromCfg(cfg)
      if (server) {
        await logoutInstance(server, cfg.evolutionInstance).catch(() => {})
        await deleteInstance(server, cfg.evolutionInstance).catch(() => {})
      }
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

    const servers = instanceServersFromCfg(cfg)
    if (servers.length === 0) return reply.status(503).send({ error: 'Config de servidor incompleta.' })

    const qrData = await tryWithServers(servers, s => connectInstance(s, cfg.evolutionInstance!))

    await prisma.configNotificacao.updateMany({
      where: { tenantId, tipo: 'WHATSAPP' },
      data:  { whatsappInstStatus: 'AGUARDANDO_QR' },
    })

    return { status: 'AGUARDANDO_QR', ...qrData }
  })
}
