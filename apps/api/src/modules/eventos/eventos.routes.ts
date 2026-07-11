import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'

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
        titulo: '🚨 *ALERTA DE FALTA DE ABERTURA*',
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

export async function eventosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const {
      tipo, pontoId, operadorId,
      dataInicio, dataFim,
      page = '1', limit = '50',
    } = request.query as Record<string, string>

    const eventos = await prisma.evento.findMany({
      where: {
        tenantId,
        ...(tipo ? { tipo: tipo as never } : {}),
        ...(pontoId ? { pontoId } : {}),
        ...(operadorId ? { meta: { path: ['operadorId'], equals: operadorId } } : {}),
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

    // Batch-resolve nomes de operadores e supervisores a partir do meta
    const opIds = [...new Set(
      eventos
        .flatMap(e => {
          const meta = e.meta as Record<string, string> | null
          return [meta?.operadorId].filter(Boolean)
        }),
    )] as string[]
    const supIds = [...new Set(
      eventos
        .flatMap(e => {
          const meta = e.meta as Record<string, string> | null
          return [meta?.supervisorId].filter(Boolean)
        }),
    )] as string[]

    const [operadores, supervisores] = await Promise.all([
      opIds.length
        ? prisma.operador.findMany({ where: { id: { in: opIds } }, select: { id: true, nome: true } })
        : [],
      supIds.length
        ? prisma.supervisor.findMany({ where: { id: { in: supIds } }, select: { id: true, nome: true } })
        : [],
    ])
    const operadorMap   = new Map(operadores.map(v => [v.id, v.nome]))
    const supervisorMap = new Map(supervisores.map(s => [s.id, s.nome]))

    return eventos.map(e => {
      const metaObj      = e.meta as Record<string, unknown> | null
      const operadorId   = metaObj?.operadorId as string | undefined
      const supervisorId = metaObj?.supervisorId as string | undefined

      // Quem agiu no evento: operador ou supervisor (campo único para a UI)
      let ator: { id: string; nome: string | null; tipo: 'OPERADOR' | 'SUPERVISOR' } | null = null
      if (operadorId) {
        ator = { id: operadorId, nome: operadorMap.get(operadorId) ?? null, tipo: 'OPERADOR' }
      } else if (supervisorId) {
        ator = { id: supervisorId, nome: supervisorMap.get(supervisorId) ?? null, tipo: 'SUPERVISOR' }
      }

      return {
        ...e,
        operador:   ator,
        monitorado: e.monitorado,
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

  // Manual WhatsApp send for an event
  app.post('/:id/enviar-whatsapp', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }

    const evento = await prisma.evento.findFirst({ where: { id, tenantId } })
    if (!evento) return reply.status(404).send({ error: 'Evento não encontrado' })
    if (evento.tipo === 'FALHA') return reply.status(400).send({ error: 'Evento de falha não é monitorado por WhatsApp.' })

    const { sendWhatsAppText, zapiConfigFrom } = await import('../../infra/zapi/zapi.service.js')

    const cfg = await prisma.configNotificacao.findFirst({
      where: { tenantId, tipo: 'WHATSAPP', ativo: true },
      select: {
        whatsappDestino: true,
        whatsappGrupoJid: true,
        zapiInstanceId: true,
        zapiToken: true,
        zapiClientToken: true,
        whatsappInstStatus: true,
      },
    })
    const zapi = zapiConfigFrom(cfg)
    if (!zapi) return reply.status(400).send({ error: 'Instância WhatsApp não configurada.' })
    if (cfg!.whatsappInstStatus !== 'CONECTADO') return reply.status(400).send({ error: 'WhatsApp não está conectado.' })
    if (!cfg!.whatsappDestino && !cfg!.whatsappGrupoJid) return reply.status(400).send({ error: 'Nenhum destino configurado (número ou grupo).' })

    const [ponto, tenant, operador] = await Promise.all([
      evento.pontoId
        ? prisma.ponto.findUnique({ where: { id: evento.pontoId }, select: { nome: true } })
        : null,
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { nome: true } }),
      (async () => {
        const meta = (evento.meta as Record<string, unknown> | null) ?? {}
        const operadorId   = meta.operadorId as string | undefined
        const supervisorId = meta.supervisorId as string | undefined
        if (operadorId) {
          const registro = await prisma.operador.findUnique({ where: { id: operadorId }, select: { nome: true } })
          return registro?.nome ?? null
        }
        if (supervisorId) {
          const registro = await prisma.supervisor.findUnique({ where: { id: supervisorId }, select: { nome: true } })
          return registro ? `${registro.nome} (Supervisor)` : null
        }
        return null
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

    async function sendTo(to: string) {
      await sendWhatsAppText(zapi!, to, text)
    }

    if (cfg!.whatsappDestino) await sendTo(cfg!.whatsappDestino)
    if (cfg!.whatsappGrupoJid) await sendTo(cfg!.whatsappGrupoJid)

    await prisma.evento.update({ where: { id }, data: { encaminhado: true } })
    return { ok: true }
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
