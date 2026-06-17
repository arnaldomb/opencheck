import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'

const TZ = 'America/Sao_Paulo'

function toLocalDateStr(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-') // YYYY-MM-DD
}

export async function relatoriosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/ciclos', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { de, ate, pontoId } = request.query as Record<string, string>

    if (!de || !ate) return reply.status(400).send({ error: 'Parâmetros de e ate são obrigatórios' })

    const dataInicio = new Date(`${de}T00:00:00`)
    const dataFim    = new Date(`${ate}T23:59:59`)

    const [tenant, pontos, eventos, ciclos] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nome: true } }),

      prisma.ponto.findMany({
        where: { tenantId, ...(pontoId ? { id: pontoId } : {}), ativo: true },
        select: { id: true, nome: true, endereco: true },
        orderBy: { nome: 'asc' },
      }),

      prisma.evento.findMany({
        where: {
          tenantId,
          ...(pontoId ? { pontoId } : {}),
          ocorridoEm: { gte: dataInicio, lte: dataFim },
        },
        include: { ponto: { select: { nome: true } } },
        orderBy: { ocorridoEm: 'asc' },
      }),

      prisma.execucaoCiclo.findMany({
        where: {
          ponto: { tenantId },
          ...(pontoId ? { pontoId } : {}),
          iniciadoEm: { gte: dataInicio, lte: dataFim },
        },
        include: { ponto: { select: { nome: true } } },
        orderBy: { iniciadoEm: 'asc' },
      }),
    ])

    // Resolve operator names from meta.vigilanteId or meta.operadorId
    const opIds = [...new Set(
      eventos.flatMap(e => {
        const meta = e.meta as Record<string, string> | null
        return [meta?.vigilanteId, meta?.operadorId].filter(Boolean)
      })
    )] as string[]
    const vigilantes = opIds.length
      ? await prisma.operador.findMany({ where: { id: { in: opIds } }, select: { id: true, nome: true } })
      : []
    const vigMap = new Map(vigilantes.map(v => [v.id, v.nome]))

    const eventosFormatados = eventos.map(e => {
      const meta        = e.meta as Record<string, string> | null
      const resolvedId  = meta?.vigilanteId ?? meta?.operadorId
      return {
        id:           e.id,
        tipo:         e.tipo,
        codigoEvento: meta?.codigoEvento ?? null,
        observacao:   meta?.observacao   ?? null,
        ponto:        e.ponto?.nome      ?? '—',
        vigilante:    resolvedId ? (vigMap.get(resolvedId) ?? '—') : '—',
        ocorridoEm:   e.ocorridoEm.toISOString(),
        encaminhado:  e.encaminhado,
        monitorado:   !!(meta?.monitorado),
      }
    })

    const ciclosFormatados = ciclos.map(c => ({
      id:           c.id,
      ponto:        c.ponto.nome,
      status:       c.status,
      iniciadoEm:   c.iniciadoEm.toISOString(),
      expiraEm:     c.expiraEm.toISOString(),
      finalizadoEm: c.finalizadoEm?.toISOString() ?? null,
      checkinEm:    c.checkinEm?.toISOString()    ?? null,
    }))

    const totalCiclos     = ciclosFormatados.length
    const ciclosConcluidos = ciclosFormatados.filter(c => c.status === 'CONCLUIDO').length
    const ciclosAlerta    = ciclosFormatados.filter(c => c.status === 'ALERTA').length
    const totalEventos    = eventosFormatados.length
    const totalCheckins   = eventosFormatados.filter(e => e.tipo === 'CHECKIN').length
    const totalAlertas    = eventosFormatados.filter(e => ['PANICO','PANICO_SILENCIOSO','COACAO','FALHA'].includes(e.tipo)).length

    return {
      geradoEm: new Date().toISOString(),
      empresa:  tenant ?? { id: tenantId, nome: 'Empresa' },
      periodo:  { de, ate },
      pontos,
      resumo: {
        totalCiclos, ciclosConcluidos, ciclosAlerta,
        totalEventos, totalCheckins,   totalAlertas,
        taxaCumprimento: totalCiclos > 0 ? Math.round((ciclosConcluidos / totalCiclos) * 100) : 0,
      },
      eventos:  eventosFormatados,
      ciclos:   ciclosFormatados,
    }
  })

  // ── Relatório de Abertura / Fechamento ────────────────────────────────────
  app.get('/abertura', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { de, ate, pontoId } = request.query as Record<string, string>

    if (!de || !ate) return reply.status(400).send({ error: 'Parâmetros de e ate são obrigatórios' })

    const dataInicio = new Date(`${de}T00:00:00-03:00`)
    const dataFim    = new Date(`${ate}T23:59:59-03:00`)

    const [tenant, pontos, eventos, configs] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nome: true } }),

      prisma.ponto.findMany({
        where: { tenantId, ...(pontoId ? { id: pontoId } : {}), ativo: true },
        select: { id: true, nome: true, endereco: true },
        orderBy: { nome: 'asc' },
      }),

      prisma.evento.findMany({
        where: {
          tenantId,
          ...(pontoId ? { pontoId } : {}),
          tipo: { in: ['ABERTURA_CHECKIN', 'ABERTURA_AUSENTE', 'FECHAMENTO_CHECKIN', 'FECHAMENTO_AUSENTE'] },
          ocorridoEm: { gte: dataInicio, lte: dataFim },
        },
        include: { ponto: { select: { nome: true } } },
        orderBy: { ocorridoEm: 'asc' },
      }),

      prisma.configAbertura.findMany({
        where: { ponto: { tenantId, ...(pontoId ? { id: pontoId } : {}) } },
        select: { pontoId: true, horaAbertura: true, toleranciaMinutos: true, horaFechamento: true, toleranciaFechamentoMinutos: true },
      }),
    ])

    const configMap = new Map(configs.map(c => [c.pontoId, c]))

    const opIds = [...new Set(eventos.flatMap(e => {
      const meta = e.meta as Record<string, string> | null
      return [meta?.operadorId, meta?.vigilanteId].filter(Boolean)
    }))] as string[]
    const operadores = opIds.length
      ? await prisma.operador.findMany({ where: { id: { in: opIds } }, select: { id: true, nome: true } })
      : []
    const opMap = new Map(operadores.map(o => [o.id, o.nome]))

    interface LinhaAbertura {
      pontoId: string; ponto: string; data: string
      statusAbertura: string; horaAberturaConfig: string | null; horaAberturaReal: string | null
      statusFechamento: string; horaFechamentoConfig: string | null; horaFechamentoReal: string | null
      operador: string
    }

    const dayMap = new Map<string, LinhaAbertura>()

    for (const ev of eventos) {
      const meta   = ev.meta as Record<string, string> | null
      const data   = toLocalDateStr(ev.ocorridoEm)
      const key    = `${ev.pontoId}::${data}`
      const config = ev.pontoId ? configMap.get(ev.pontoId) : null
      const opId   = meta?.operadorId ?? meta?.vigilanteId
      const nomeOp = opId ? (opMap.get(opId) ?? '—') : '—'

      if (!dayMap.has(key)) {
        dayMap.set(key, {
          pontoId:              ev.pontoId ?? '',
          ponto:                ev.ponto?.nome ?? '—',
          data,
          statusAbertura:       'Aguardando Abertura',
          horaAberturaConfig:   config?.horaAbertura ?? null,
          horaAberturaReal:     null,
          statusFechamento:     config?.horaFechamento ? 'Aguardando Fechamento' : '—',
          horaFechamentoConfig: config?.horaFechamento ?? null,
          horaFechamentoReal:   null,
          operador:             '—',
        })
      }

      const entry = dayMap.get(key)!

      if (ev.tipo === 'ABERTURA_CHECKIN') {
        entry.statusAbertura   = meta?.statusAbertura === 'NO_PRAZO' ? 'Aberta' : 'Aberta Fora do Horário'
        entry.horaAberturaReal = ev.ocorridoEm.toISOString()
        if (nomeOp !== '—') entry.operador = nomeOp
      } else if (ev.tipo === 'ABERTURA_AUSENTE') {
        if (entry.statusAbertura === 'Aguardando Abertura') entry.statusAbertura = 'Não Abriu'
      } else if (ev.tipo === 'FECHAMENTO_CHECKIN') {
        entry.statusFechamento   = 'Fechada'
        entry.horaFechamentoReal = ev.ocorridoEm.toISOString()
        if (nomeOp !== '—') entry.operador = nomeOp
      } else if (ev.tipo === 'FECHAMENTO_AUSENTE') {
        if (entry.statusFechamento !== 'Fechada') entry.statusFechamento = 'Não Fechou'
      }
    }

    const linhas = Array.from(dayMap.values())
      .sort((a, b) => a.data.localeCompare(b.data) || a.ponto.localeCompare(b.ponto))

    const totalLinhas    = linhas.length
    const abertas        = linhas.filter(l => l.statusAbertura === 'Aberta').length
    const abertasFora    = linhas.filter(l => l.statusAbertura === 'Aberta Fora do Horário').length
    const naoAbriram     = linhas.filter(l => l.statusAbertura === 'Não Abriu').length
    const fechadas       = linhas.filter(l => l.statusFechamento === 'Fechada').length
    const naoFecharam    = linhas.filter(l => l.statusFechamento === 'Não Fechou').length

    return {
      geradoEm: new Date().toISOString(),
      empresa:  tenant ?? { id: tenantId, nome: 'Empresa' },
      periodo:  { de, ate },
      pontos,
      resumo:   { totalLinhas, abertas, abertasFora, naoAbriram, fechadas, naoFecharam },
      linhas,
    }
  })
}
