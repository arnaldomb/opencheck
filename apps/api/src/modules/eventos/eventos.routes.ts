import type { FastifyInstance } from 'fastify'
import { prisma } from '@alerta-vigia/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { getEzvizClient } from '../../infra/ezviz/ezviz.factory.js'
import { uploadFromUrl } from '../../infra/storage/storage.service.js'

export async function eventosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const {
      tipo, pontoId, vigilanteId,
      dataInicio, dataFim,
      page = '1', limit = '50',
    } = request.query as Record<string, string>

    const eventos = await prisma.evento.findMany({
      where: {
        tenantId,
        ...(tipo ? { tipo: tipo as never } : {}),
        ...(pontoId ? { pontoId } : {}),
        ...(vigilanteId ? { meta: { path: ['vigilanteId'], equals: vigilanteId } } : {}),
        ...((dataInicio || dataFim) ? {
          ocorridoEm: {
            ...(dataInicio ? { gte: new Date(dataInicio) } : {}),
            ...(dataFim   ? { lte: new Date(dataFim)    } : {}),
          },
        } : {}),
      },
      include: { ponto: { select: { nome: true } } },
      orderBy: { ocorridoEm: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    })

    // Batch-resolve vigilante names from meta.vigilanteId
    const vigIds = [...new Set(
      eventos
        .map(e => (e.meta as Record<string, string> | null)?.vigilanteId)
        .filter(Boolean),
    )] as string[]

    const vigilantes = vigIds.length
      ? await prisma.vigilante.findMany({
          where: { id: { in: vigIds } },
          select: { id: true, nome: true },
        })
      : []
    const vigMap = new Map(vigilantes.map(v => [v.id, v.nome]))

    // Batch-resolve snapshots
    const ids = eventos.map(e => e.id)
    const snapshots = await prisma.snapshot.findMany({
      where: { eventoId: { in: ids } },
      select: { eventoId: true, imageUrl: true, id: true },
    })
    const snapMap = new Map(snapshots.map(s => [s.eventoId, { id: s.id, imageUrl: s.imageUrl }]))

    return eventos.map(e => {
      const metaObj   = e.meta as Record<string, unknown> | null
      const vigId     = metaObj?.vigilanteId as string | undefined
      return {
        ...e,
        snapshot:    snapMap.get(e.id) ?? null,
        vigilante:   vigId ? { id: vigId, nome: vigMap.get(vigId) ?? null } : null,
        monitorado:  e.monitorado,
      }
    })
  })

  // Toggle monitoring status on an event
  app.patch('/:id/monitorar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }

    const evento = await prisma.evento.findFirst({ where: { id, tenantId } })
    if (!evento) return reply.status(404).send({ error: 'Evento não encontrado' })

    const meta      = (evento.meta as Record<string, unknown> | null) ?? {}
    const monitorado = !meta.monitorado

    await prisma.evento.update({
      where: { id },
      data:  { meta: { ...meta, monitorado } },
    })

    return { id, monitorado }
  })

  // Live stream for the camera at the event's ponto
  app.get('/:id/stream', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }

    const evento = await prisma.evento.findFirst({ where: { id, tenantId } })
    if (!evento) return reply.status(404).send({ error: 'Evento não encontrado' })
    if (!evento.pontoId) return reply.status(400).send({ error: 'Evento sem ponto associado' })

    const cameras = await prisma.camera.findMany({ where: { pontoId: evento.pontoId, ativa: true }, take: 1 })
    if (!cameras[0]) return reply.status(400).send({ error: 'Nenhuma câmera ativa neste ponto' })

    const client     = getEzvizClient()
    // protocol=2 returns HLS (.m3u8) on this region
    const hlsResult  = await client.getLiveStreamUrl(cameras[0].deviceSerial, cameras[0].channelNo, '2')
    const rtmpResult = await client.getLiveStreamUrl(cameras[0].deviceSerial, cameras[0].channelNo, '3').catch(() => null)

    return { hls: hlsResult.url, rtmp: rtmpResult?.url ?? null, expireTime: hlsResult.expireTime }
  })

  // Manual WhatsApp send for an event
  app.post('/:id/enviar-whatsapp', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }

    const evento = await prisma.evento.findFirst({ where: { id, tenantId } })
    if (!evento) return reply.status(404).send({ error: 'Evento não encontrado' })

    const { sendWhatsAppText, sendWhatsAppMedia } = await import('../../infra/evogo/evogo.service.js')

    const cfg = await prisma.configNotificacao.findFirst({
      where: { tenantId, tipo: 'WHATSAPP', ativo: true },
      select: {
        whatsappDestino: true,
        whatsappGrupoJid: true,
        evolutionUrl: true,
        evolutionApiKey: true,
        evolutionInstance: true,
        evolutionInstanceToken: true,
        whatsappInstStatus: true,
      },
    })
    if (!cfg?.evolutionUrl || !cfg?.evolutionInstance) return reply.status(400).send({ error: 'Instância WhatsApp não configurada.' })
    if (cfg.whatsappInstStatus !== 'CONECTADO') return reply.status(400).send({ error: 'WhatsApp não está conectado.' })
    if (!cfg.whatsappDestino && !cfg.whatsappGrupoJid) return reply.status(400).send({ error: 'Nenhum destino configurado (número ou grupo).' })

    const ponto = evento.pontoId
      ? await prisma.ponto.findUnique({ where: { id: evento.pontoId }, select: { nome: true } })
      : null

    const TIPO_PT: Record<string, string> = {
      PANICO: '🚨 PÂNICO', PANICO_SILENCIOSO: '🚨 PÂNICO SILENCIOSO',
      COACAO: '⚠️ COAÇÃO', FALHA: '🔴 FALHA DE DISPOSITIVO', CHECKIN: '✅ CHECK-IN',
    }
    const tipoLabel = TIPO_PT[evento.tipo] ?? evento.tipo
    const dataHora  = evento.ocorridoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const text = `${tipoLabel}\n📍 ${ponto?.nome ?? '—'}\n🕐 ${dataHora}\n\nVerifique imediatamente.`

    const candidates = [
      cfg.evolutionInstanceToken ? { url: cfg.evolutionUrl, apiKey: cfg.evolutionInstanceToken, instance: cfg.evolutionInstance } : null,
      cfg.evolutionApiKey ? { url: cfg.evolutionUrl, apiKey: cfg.evolutionApiKey, instance: cfg.evolutionInstance } : null,
    ].filter(Boolean) as Array<{ url: string; apiKey: string; instance: string }>
    if (candidates.length === 0) return reply.status(503).send({ error: 'Servidor WhatsApp não configurado.' })

    async function sendTo(to: string) {
      let lastErr: unknown = null
      for (const evoConfig of candidates) {
        try {
          await sendWhatsAppText(evoConfig, to, text)
          const snapshot = await prisma.snapshot.findFirst({ where: { eventoId: id } })
          if (snapshot?.imageUrl) {
            await sendWhatsAppMedia(evoConfig, to, snapshot.imageUrl, '📸 Snapshot do evento').catch(() => {})
          }
          return
        } catch (err) {
          const msg = String(err)
          const authErr = msg.includes('401') || msg.includes('403') || msg.includes('not authorized')
          if (!authErr) throw err
          lastErr = err
        }
      }
      throw lastErr ?? new Error('Falha ao autenticar no servidor WhatsApp.')
    }

    if (cfg.whatsappDestino) await sendTo(cfg.whatsappDestino)
    if (cfg.whatsappGrupoJid) await sendTo(cfg.whatsappGrupoJid)

    await prisma.evento.update({ where: { id }, data: { encaminhado: true } })
    return { ok: true }
  })

  // Capture snapshot on demand for an event without one
  app.post('/:id/capturar-snapshot', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }

    const evento = await prisma.evento.findFirst({ where: { id, tenantId } })
    if (!evento) return reply.status(404).send({ error: 'Evento não encontrado' })
    if (!evento.pontoId) return reply.status(400).send({ error: 'Evento sem ponto associado' })

    const cameras = await prisma.camera.findMany({ where: { pontoId: evento.pontoId, ativa: true }, take: 1 })
    if (!cameras[0]) return reply.status(400).send({ error: 'Nenhuma câmera ativa neste ponto' })

    const client     = getEzvizClient()
    const { picUrl } = await client.captureSnapshot(cameras[0].deviceSerial, cameras[0].channelNo)
    const key        = `${tenantId}/${cameras[0].id}/${Date.now()}.jpg`
    const imageUrl   = await uploadFromUrl(picUrl, key)
    const snapshot   = await prisma.snapshot.create({ data: { cameraId: cameras[0].id, imageUrl, eventoId: id } })

    return { id: snapshot.id, imageUrl }
  })

  app.get('/stats', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const [total, checkins, alertas, hoje] = await Promise.all([
      prisma.evento.count({ where: { tenantId } }),
      prisma.evento.count({ where: { tenantId, tipo: 'CHECKIN' } }),
      prisma.evento.count({ where: { tenantId, tipo: { in: ['PANICO', 'FALHA'] } } }),
      prisma.evento.count({ where: { tenantId, ocorridoEm: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ])
    return { total, checkins, alertas, hoje }
  })
}
