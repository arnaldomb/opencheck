import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'

export async function configuracoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ── Feature flags do tenant ───────────────────────────────────────────────
  app.get('/features', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { camerasHabilitadas: true },
    })
    return { camerasHabilitadas: tenant?.camerasHabilitadas ?? true }
  })

  // ── Câmeras EZVIZ ──────────────────────────────────────────────────────────

  app.get('/cameras', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    return prisma.camera.findMany({
      where: { tenantId, ativa: true },
      include: { ponto: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: 'asc' },
    })
  })

  app.post('/cameras', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as { deviceSerial: string; deviceName?: string; channelNo?: number; pontoId?: string }
    if (!body.deviceSerial?.trim()) return reply.status(400).send({ error: 'Serial do dispositivo é obrigatório' })
    const camera = await prisma.camera.create({
      data: { tenantId, ...body },
      include: { ponto: { select: { id: true, nome: true } } },
    })
    return reply.status(201).send(camera)
  })

  app.delete('/cameras/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const camera = await prisma.camera.findFirst({ where: { id, tenantId } })
    if (!camera) return reply.status(404).send({ error: 'Câmera não encontrada' })
    await prisma.camera.update({ where: { id }, data: { ativa: false } })
    return { success: true }
  })

  // ── Notificações ──────────────────────────────────────────────────────────

  app.get('/notificacoes', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const configs = await prisma.configNotificacao.findMany({ where: { tenantId } })
    const wpp  = configs.find(c => c.tipo === 'WHATSAPP')
    const ctrl = configs.find(c => c.tipo === 'CTRLSAFE')
    return {
      alertarPorWhatsapp:  wpp?.ativo             ?? false,
      whatsappNumero:      wpp?.whatsappDestino    ?? '',
      whatsappEventos:     wpp?.whatsappEventos    ?? [],
      alertarPorCtrlSafe:  ctrl?.ativo            ?? false,
    }
  })

  app.put('/notificacoes', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as {
      alertarPorWhatsapp: boolean
      whatsappNumero?: string
      whatsappEventos?: string[]
      alertarPorCtrlSafe: boolean
    }
    await Promise.all([
      prisma.configNotificacao.upsert({
        where:  { tenantId_tipo: { tenantId, tipo: 'WHATSAPP' } },
        update: { ativo: body.alertarPorWhatsapp, whatsappDestino: body.whatsappNumero, whatsappEventos: body.whatsappEventos ?? [] },
        create: { tenantId, tipo: 'WHATSAPP', ativo: body.alertarPorWhatsapp, whatsappDestino: body.whatsappNumero, whatsappEventos: body.whatsappEventos ?? [] },
      }),
      prisma.configNotificacao.upsert({
        where:  { tenantId_tipo: { tenantId, tipo: 'CTRLSAFE' } },
        update: { ativo: body.alertarPorCtrlSafe },
        create: { tenantId, tipo: 'CTRLSAFE', ativo: body.alertarPorCtrlSafe },
      }),
    ])
    return { ok: true }
  })

  // Test WhatsApp
  app.post('/notificacoes/testar-whatsapp', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { sendWhatsAppText } = await import('../../infra/evogo/evogo.service.js')

    const cfg = await prisma.configNotificacao.findFirst({
      where: { tenantId, tipo: 'WHATSAPP' },
      select: {
        whatsappDestino: true,
        whatsappGrupoJid: true,
        whatsappInstStatus: true,
        evolutionUrl: true,
        evolutionApiKey: true,
        evolutionInstance: true,
        evolutionInstanceToken: true,
      },
    })
    if (!cfg?.whatsappDestino && !cfg?.whatsappGrupoJid) {
      return reply.status(400).send({ error: 'Nenhum destino configurado (número ou grupo).' })
    }
    if (!cfg.evolutionUrl || !cfg.evolutionInstance) return reply.status(400).send({ error: 'Instância WhatsApp não configurada.' })
    if (cfg.whatsappInstStatus !== 'CONECTADO') return reply.status(400).send({ error: 'WhatsApp não está conectado.' })

    const candidates = [
      cfg.evolutionInstanceToken ? { url: cfg.evolutionUrl, apiKey: cfg.evolutionInstanceToken, instance: cfg.evolutionInstance } : null,
      cfg.evolutionApiKey ? { url: cfg.evolutionUrl, apiKey: cfg.evolutionApiKey, instance: cfg.evolutionInstance } : null,
    ].filter(Boolean) as Array<{ url: string; apiKey: string; instance: string }>

    if (candidates.length === 0) return reply.status(503).send({ error: 'Servidor WhatsApp não configurado.' })

    const text = '✅ *OpenCheck* — Conexão WhatsApp testada com sucesso!'

    async function sendTo(to: string) {
      let lastErr: unknown = null
      for (const evoConfig of candidates) {
        try {
          await sendWhatsAppText(evoConfig, to, text)
          return
        } catch (err) {
          const msg = String(err)
          const authErr = msg.includes('401') || msg.includes('403') || msg.includes('not authorized')
          if (!authErr) {
            throw new Error(msg)
          }
          lastErr = err
        }
      }
      throw lastErr ?? new Error('Falha ao autenticar no servidor WhatsApp.')
    }

    try {
      if (cfg.whatsappDestino) await sendTo(cfg.whatsappDestino)
      if (cfg.whatsappGrupoJid) await sendTo(cfg.whatsappGrupoJid)
      return { ok: true }
    } catch (err) {
      return reply.status(502).send({ error: 'Falha ao enviar mensagem de teste.', details: String(err) })
    }
  })
}
