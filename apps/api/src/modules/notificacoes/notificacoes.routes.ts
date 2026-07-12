import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import {
  getStatus,
  getQrCodeImage,
  listGroups,
  disconnect,
  sendWhatsAppText,
  zapiConfigFrom,
} from '../../infra/zapi/zapi.service.js'
// (credenciais da instância gerenciadas pelo superadmin — ver superadmin.routes.ts)

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getWppCfg(tenantId: string) {
  return prisma.configNotificacao.findFirst({
    where: { tenantId, tipo: 'WHATSAPP' },
    select: {
      ativo: true,
      zapiInstanceId: true,
      zapiToken: true,
      zapiClientToken: true,
      whatsappInstStatus: true,
      whatsappDestino: true,
      whatsappGrupoJid: true,
      whatsappGrupoNome: true,
    },
  })
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
  // Instância WhatsApp (Z-API)
  //
  // As credenciais da instância (instanceId + token) são cadastradas pelo
  // superadmin e vinculadas à empresa em /superadmin/clientes/:id/whatsapp.
  // Aqui o cliente apenas: lê o QR, acompanha o status, escolhe o grupo e o
  // número que recebem as notificações e envia mensagem de teste.
  // ════════════════════════════════════════════════════════════════════════════

  // ── GET /whatsapp/qr — QR code em base64 para conectar o aparelho ─────────
  app.get('/whatsapp/qr', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const cfg = await getWppCfg(tenantId)
    const zapi = zapiConfigFrom(cfg)
    if (!zapi) return reply.status(400).send({ error: 'Instância WhatsApp não vinculada. Solicite ao administrador da plataforma.' })

    const status = await getStatus(zapi).catch(() => null)
    if (status?.connected) {
      return { status: 'CONECTADO', qrCode: null }
    }

    const qrCode = await getQrCodeImage(zapi)
    if (qrCode) {
      await prisma.configNotificacao.updateMany({
        where: { tenantId, tipo: 'WHATSAPP' },
        data:  { whatsappInstStatus: 'AGUARDANDO_QR' },
      })
    }
    return { status: qrCode ? 'AGUARDANDO_QR' : 'DESCONECTADO', qrCode }
  })

  // ── GET /whatsapp/status — status da conexão ──────────────────────────────
  app.get('/whatsapp/status', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const cfg = await getWppCfg(tenantId)
    const zapi = zapiConfigFrom(cfg)
    if (!zapi) return { status: 'SEM_INSTANCIA' }

    try {
      const status = await getStatus(zapi)
      const novoStatus = status.connected ? 'CONECTADO' : (cfg!.whatsappInstStatus === 'AGUARDANDO_QR' ? 'AGUARDANDO_QR' : 'DESCONECTADO')

      if (novoStatus !== cfg!.whatsappInstStatus) {
        await prisma.configNotificacao.updateMany({
          where: { tenantId, tipo: 'WHATSAPP' },
          data:  { whatsappInstStatus: novoStatus, ...(status.connected ? { ativo: true } : {}) },
        })
      }

      return {
        status:              novoStatus,
        smartphoneConnected: status.smartphoneConnected ?? null,
        erro:                status.error ?? null,
        grupoJid:            cfg!.whatsappGrupoJid ?? null,
        grupoNome:           cfg!.whatsappGrupoNome ?? null,
        destino:             cfg!.whatsappDestino ?? null,
      }
    } catch {
      return {
        status:    cfg!.whatsappInstStatus ?? 'DESCONECTADO',
        grupoJid:  cfg!.whatsappGrupoJid  ?? null,
        grupoNome: cfg!.whatsappGrupoNome ?? null,
        destino:   cfg!.whatsappDestino ?? null,
      }
    }
  })

  // ── GET /whatsapp/grupos — listar grupos do WhatsApp conectado ────────────
  app.get('/whatsapp/grupos', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const cfg = await getWppCfg(tenantId)
    const zapi = zapiConfigFrom(cfg)
    if (!zapi) return reply.status(400).send({ error: 'Credenciais Z-API não configuradas.' })

    try {
      return await listGroups(zapi)
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err)
      if (msg.includes('429')) {
        return reply.status(429).send({ error: 'A Z-API limitou as consultas. Aguarde alguns segundos e tente novamente.' })
      }
      return reply.status(502).send({ error: `Falha ao listar grupos: ${msg.slice(0, 200)}` })
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

  // ── POST /whatsapp/desconectar — derruba a sessão para reconectar com QR ──
  // Mantém as credenciais da instância e o grupo/número configurados.
  app.post('/whatsapp/desconectar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const cfg = await getWppCfg(tenantId)
    const zapi = zapiConfigFrom(cfg)
    if (!zapi) return reply.status(400).send({ error: 'Instância WhatsApp não vinculada.' })

    await disconnect(zapi)
    await prisma.configNotificacao.updateMany({
      where: { tenantId, tipo: 'WHATSAPP' },
      data:  { whatsappInstStatus: 'DESCONECTADO' },
    })
    return { ok: true, status: 'DESCONECTADO' }
  })

  // ── POST /whatsapp/testar — envia mensagem de teste ───────────────────────
  app.post('/whatsapp/testar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const cfg = await getWppCfg(tenantId)
    const zapi = zapiConfigFrom(cfg)
    if (!zapi) return reply.status(400).send({ error: 'Credenciais Z-API não configuradas.' })
    if (!cfg?.whatsappDestino && !cfg?.whatsappGrupoJid) {
      return reply.status(400).send({ error: 'Nenhum destino configurado (número ou grupo).' })
    }

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
