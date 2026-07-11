import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'

// data URI de imagem, limitado a ~700KB (≈500KB de imagem original)
const LOGO_PREFIX = /^data:image\/(png|jpe?g|webp);base64,/
const LOGO_MAX_CHARS = 700_000

export async function configuracoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ── Logo do cliente ───────────────────────────────────────────────────────

  app.get('/logo', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoUrl: true, nome: true },
    })
    return { logoUrl: tenant?.logoUrl ?? null, nome: tenant?.nome ?? '' }
  })

  app.put('/logo', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { logo } = (request.body ?? {}) as { logo?: string }

    if (!logo || !LOGO_PREFIX.test(logo)) {
      return reply.status(400).send({ error: 'Envie uma imagem PNG, JPEG ou WebP em base64 (data URI)' })
    }
    if (logo.length > LOGO_MAX_CHARS) {
      return reply.status(400).send({ error: 'Imagem muito grande — use um arquivo de até 500KB' })
    }

    await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: logo } })
    return { ok: true }
  })

  app.delete('/logo', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl: null } })
    return { ok: true }
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

  // Test WhatsApp (Z-API)
  app.post('/notificacoes/testar-whatsapp', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { sendWhatsAppText, zapiConfigFrom } = await import('../../infra/zapi/zapi.service.js')

    const cfg = await prisma.configNotificacao.findFirst({
      where: { tenantId, tipo: 'WHATSAPP' },
      select: {
        whatsappDestino: true,
        whatsappGrupoJid: true,
        whatsappInstStatus: true,
        zapiInstanceId: true,
        zapiToken: true,
        zapiClientToken: true,
      },
    })
    if (!cfg?.whatsappDestino && !cfg?.whatsappGrupoJid) {
      return reply.status(400).send({ error: 'Nenhum destino configurado (número ou grupo).' })
    }
    const zapi = zapiConfigFrom(cfg)
    if (!zapi) return reply.status(400).send({ error: 'Instância WhatsApp não vinculada. Solicite ao administrador da plataforma.' })
    if (cfg.whatsappInstStatus !== 'CONECTADO') return reply.status(400).send({ error: 'WhatsApp não está conectado.' })

    const text = '✅ *OpenCheck* — Conexão WhatsApp testada com sucesso!'
    try {
      if (cfg.whatsappDestino) await sendWhatsAppText(zapi, cfg.whatsappDestino, text)
      if (cfg.whatsappGrupoJid) await sendWhatsAppText(zapi, cfg.whatsappGrupoJid, text)
      return { ok: true }
    } catch (err) {
      return reply.status(502).send({ error: 'Falha ao enviar mensagem de teste.', details: String(err instanceof Error ? err.message : err).slice(0, 300) })
    }
  })
}
