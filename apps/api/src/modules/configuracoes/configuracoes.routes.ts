import type { FastifyInstance } from 'fastify'
import { prisma } from '@alerta-vigia/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'

export async function configuracoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

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
    const { getEvoGoConfig, sendWhatsAppText } = await import('../../infra/evogo/evogo.service.js')
    const eConfig = getEvoGoConfig()
    if (!eConfig) return reply.status(503).send({ error: 'Integração WhatsApp não configurada no servidor.' })

    const cfg = await prisma.configNotificacao.findFirst({
      where: { tenantId, tipo: 'WHATSAPP' },
      select: { whatsappDestino: true },
    })
    if (!cfg?.whatsappDestino) return reply.status(400).send({ error: 'Número de destino não configurado.' })
    await sendWhatsAppText(eConfig, cfg.whatsappDestino, '✅ *Alerta Vigia* — Conexão WhatsApp testada com sucesso!')
    return { ok: true }
  })
}
