import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { getEzvizClient } from '../../infra/ezviz/ezviz.factory.js'
import { uploadFromUrl } from '../../infra/storage/storage.service.js'

const TZ = 'America/Sao_Paulo'

function dataHoraMensagem(data = new Date()): string {
  const dataFmt = data.toLocaleDateString('pt-BR', { timeZone: TZ })
  const horaFmt = data.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  return `${dataFmt} às ${horaFmt}`
}

function buildMensagemCorporativa(opts: {
  titulo: string
  introducao: string
  empresa: string
  ponto: string
  operador: string | null
  fechamento: string
  data?: Date
}): string {
  const { titulo, introducao, empresa, ponto, operador, fechamento, data } = opts
  const responsavel = operador ?? 'Não identificado'

  return (
    `${titulo}\n\n` +
    `${introducao}\n\n` +
    `Empresa: ${empresa}\n` +
    `Unidade: ${ponto}\n` +
    `Responsável: ${responsavel}\n` +
    `Data/Hora: ${dataHoraMensagem(data)}\n\n` +
    `${fechamento}`
  )
}

function buildMensagemEventoManual(opts: {
  tipo: string
  empresa: string
  ponto: string
  operador: string | null
  data: Date
  statusAbertura?: string | null
}): string {
  const { tipo, empresa, ponto, operador, data, statusAbertura } = opts

  switch (tipo) {
    case 'CHECKIN':
      return buildMensagemCorporativa({
        titulo: '✅ *CHECK-IN CONFIRMADO*',
        introducao: 'O check-in da unidade foi registrado com sucesso no sistema.',
        empresa,
        ponto,
        operador,
        fechamento: 'Registro operacional concluído com sucesso.',
        data,
      })

    case 'ABERTURA_CHECKIN':
      return buildMensagemCorporativa({
        titulo: statusAbertura === 'NO_PRAZO'
          ? '✅ *CHECK-IN DE ABERTURA CONFIRMADO*'
          : '⚠️ *CHECK-IN DE ABERTURA COM ATRASO*',
        introducao: statusAbertura === 'NO_PRAZO'
          ? 'A abertura da unidade foi realizada dentro do período operacional estabelecido.'
          : 'A abertura da unidade foi registrada fora do período operacional estabelecido.',
        empresa,
        ponto,
        operador,
        fechamento: statusAbertura === 'NO_PRAZO'
          ? 'Conformidade operacional registrada com sucesso.'
          : 'Ocorrência registrada para acompanhamento operacional.',
        data,
      })

    case 'PANICO':
      return buildMensagemCorporativa({
        titulo: '🚨 *ALERTA DE PÂNICO*',
        introducao: 'Foi registrado um acionamento de pânico na unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos atuação imediata conforme os protocolos de emergência.',
        data,
      })

    case 'PANICO_SILENCIOSO':
      return buildMensagemCorporativa({
        titulo: '🚨 *ALERTA DE PÂNICO SILENCIOSO*',
        introducao: 'Foi registrado um acionamento silencioso na unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos atuação discreta e imediata, sem contato direto com a unidade.',
        data,
      })

    case 'COACAO':
      return buildMensagemCorporativa({
        titulo: '⚠️ *ALERTA DE COAÇÃO*',
        introducao: 'Foi identificado um possível cenário de coação envolvendo a unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos verificação imediata com abordagem discreta, sem contato direto com a unidade.',
        data,
      })

    case 'ALERTA':
      return buildMensagemCorporativa({
        titulo: '🚨 *ALERTA DE CHECK-IN NÃO REALIZADO*',
        introducao: 'Não foi identificado check-in da unidade dentro do período operacional esperado.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos a verificação imediata da situação para garantir o cumprimento dos procedimentos operacionais.',
        data,
      })

    case 'ABERTURA_AUSENTE':
      return buildMensagemCorporativa({
        titulo: '🚨 *ALERTA DE ABERTURA FORA DO HORÁRIO*',
        introducao: 'Foi identificado atraso na abertura da unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos a verificação imediata da situação para garantir o cumprimento dos procedimentos operacionais.',
        data,
      })

    default:
      return buildMensagemCorporativa({
        titulo: `ℹ️ *${tipo}*`,
        introducao: 'Foi registrada uma ocorrência operacional na unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos acompanhamento da ocorrência conforme os procedimentos definidos.',
        data,
      })
  }
}

function buildLegendaSnapshotManual(tipo: string, ponto: string, data: Date): string {
  const tituloPorTipo: Record<string, string> = {
    CHECKIN: '📎 Evidência da ocorrência: Check-in confirmado',
    ABERTURA_CHECKIN: '📎 Evidência da ocorrência: Check-in de abertura',
    PANICO: '📎 Evidência da ocorrência: Alerta de pânico',
    PANICO_SILENCIOSO: '📎 Evidência da ocorrência: Alerta de pânico silencioso',
    COACAO: '📎 Evidência da ocorrência: Alerta de coação',
    ALERTA: '📎 Evidência da ocorrência: Check-in não realizado',
    ABERTURA_AUSENTE: '📎 Evidência da ocorrência: Abertura fora do horário',
  }

  return (
    `${tituloPorTipo[tipo] ?? '📎 Evidência da ocorrência'}\n` +
    `Unidade: ${ponto}\n` +
    `Data/Hora: ${dataHoraMensagem(data)}`
  )
}

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
      ? await prisma.operador.findMany({
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
    if (evento.tipo === 'FALHA') return reply.status(400).send({ error: 'Evento de falha não é monitorado por WhatsApp.' })

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

    const [ponto, tenant, operador] = await Promise.all([
      evento.pontoId
        ? prisma.ponto.findUnique({ where: { id: evento.pontoId }, select: { nome: true } })
        : null,
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { nome: true } }),
      (async () => {
        const meta = (evento.meta as Record<string, unknown> | null) ?? {}
        const operadorId = (meta.operadorId ?? meta.vigilanteId) as string | undefined
        if (!operadorId) return null
        const registro = await prisma.operador.findUnique({ where: { id: operadorId }, select: { nome: true } })
        return registro?.nome ?? null
      })(),
    ])

    const meta = (evento.meta as Record<string, unknown> | null) ?? {}
    const text = buildMensagemEventoManual({
      tipo: evento.tipo,
      empresa: tenant?.nome ?? 'Empresa',
      ponto: ponto?.nome ?? 'Ponto',
      operador,
      data: evento.ocorridoEm,
      statusAbertura: (meta.statusAbertura as string | undefined) ?? null,
    })
    const mediaCaption = buildLegendaSnapshotManual(
      evento.tipo,
      ponto?.nome ?? 'Ponto',
      evento.ocorridoEm,
    )

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
            await sendWhatsAppMedia(evoConfig, to, snapshot.imageUrl, mediaCaption).catch(() => {})
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
