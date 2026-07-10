import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { getRondas } from '../supervisores/supervisores.service.js'

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

    // Resolve operator names from meta.operadorId
    const opIds = [...new Set(
      eventos.flatMap(e => {
        const meta = e.meta as Record<string, string> | null
        return [meta?.operadorId].filter(Boolean)
      })
    )] as string[]
    const operadores = opIds.length
      ? await prisma.operador.findMany({ where: { id: { in: opIds } }, select: { id: true, nome: true } })
      : []
    const operadorMap = new Map(operadores.map(v => [v.id, v.nome]))

    const eventosFormatados = eventos.map(e => {
      const meta       = e.meta as Record<string, string> | null
      const operadorId = meta?.operadorId
      return {
        id:           e.id,
        tipo:         e.tipo,
        codigoEvento: meta?.codigoEvento ?? null,
        observacao:   meta?.observacao   ?? null,
        ponto:        e.ponto?.nome      ?? '—',
        operador:     operadorId ? (operadorMap.get(operadorId) ?? '—') : '—',
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

    const [tenant, pontos, registros] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nome: true } }),

      prisma.ponto.findMany({
        where: { tenantId, ...(pontoId ? { id: pontoId } : {}), ativo: true },
        select: { id: true, nome: true, endereco: true },
        orderBy: { nome: 'asc' },
      }),

      prisma.registroAbertura.findMany({
        where: {
          tenantId,
          ...(pontoId ? { pontoId } : {}),
          data: { gte: dataInicio, lte: dataFim },
        },
        include: {
          ponto:      { select: { nome: true } },
          turno:      { select: { horaAbertura: true, horaFechamento: true } },
          operador:   { select: { nome: true } },
          supervisor: { select: { nome: true } },
          fechamentoOperador:   { select: { nome: true } },
          fechamentoSupervisor: { select: { nome: true } },
        },
        orderBy: [{ data: 'asc' }, { ponto: { nome: 'asc' } }],
      }),
    ])

    const STATUS_ABERTURA_PT: Record<string, string> = {
      NO_PRAZO:  'Aberta',
      ATRASADO:  'Aberta Fora do Horário',
      AUSENTE:   'Não Abriu',
    }
    const STATUS_FECHAMENTO_PT: Record<string, string> = {
      NO_PRAZO:    'Fechada',
      ATRASADO:    'Fechada (Atrasado)',
      AUSENTE:     'Não Fechou',
      AUTO_FECHADO:'Fechada (Auto)',
    }

    const linhas = registros.map(r => ({
      pontoId:              r.pontoId,
      ponto:                r.ponto.nome,
      data:                 toLocalDateStr(r.data),
      statusAbertura:       STATUS_ABERTURA_PT[r.status] ?? r.status,
      horaAberturaConfig:   r.turno?.horaAbertura ?? null,
      horaAberturaReal:     r.abertaEm?.toISOString() ?? null,
      statusFechamento:     r.statusFechamento ? (STATUS_FECHAMENTO_PT[r.statusFechamento] ?? r.statusFechamento) : (r.turno?.horaFechamento ? 'Aguardando Fechamento' : '—'),
      horaFechamentoConfig: r.turno?.horaFechamento ?? null,
      horaFechamentoReal:   r.fechamentoEm?.toISOString() ?? null,
      operador:             r.operador?.nome
                              ?? (r.supervisor ? `${r.supervisor.nome} (Supervisor)` : null)
                              ?? r.fechamentoOperador?.nome
                              ?? (r.fechamentoSupervisor ? `${r.fechamentoSupervisor.nome} (Supervisor)` : null)
                              ?? '—',
    }))

    const totalLinhas = linhas.length
    const abertas     = linhas.filter(l => l.statusAbertura === 'Aberta').length
    const abertasFora = linhas.filter(l => l.statusAbertura === 'Aberta Fora do Horário').length
    const naoAbriram  = linhas.filter(l => l.statusAbertura === 'Não Abriu').length
    const fechadas    = linhas.filter(l => ['Fechada', 'Fechada (Atrasado)', 'Fechada (Auto)'].includes(l.statusFechamento)).length
    const naoFecharam = linhas.filter(l => l.statusFechamento === 'Não Fechou').length

    return {
      geradoEm: new Date().toISOString(),
      empresa:  tenant ?? { id: tenantId, nome: 'Empresa' },
      periodo:  { de, ate },
      pontos,
      resumo:   { totalLinhas, abertas, abertasFora, naoAbriram, fechadas, naoFecharam },
      linhas,
    }
  })

  app.get('/rondas', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { de, ate, pontoId, supervisorId } = request.query as Record<string, string>

    if (!de || !ate) return reply.status(400).send({ error: 'Parâmetros de e ate são obrigatórios' })

    const dataInicio = new Date(`${de}T00:00:00-03:00`)
    const dataFim    = new Date(`${ate}T23:59:59-03:00`)

    const [tenant, supervisores, visitas] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nome: true } }),
      prisma.supervisor.findMany({
        where: { tenantId, ...(supervisorId ? { id: supervisorId } : {}), ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      }),
      getRondas(tenantId, { supervisorId, pontoId, dataInicio, dataFim }),
    ])

    const concluidas       = visitas.filter(v => !v.emAberto && v.entradaEm && v.saidaEm)
    const emAberto         = visitas.filter(v => v.emAberto).length
    const saidasSemEntrada = visitas.filter(v => !v.entradaEm).length
    const tempoTotal       = concluidas.reduce((acc, v) => acc + (v.duracaoMinutos ?? 0), 0)
    const pontosVisitados  = new Set(visitas.map(v => v.pontoId)).size
    const supervisoresAtivos = new Set(visitas.map(v => v.supervisorId)).size

    return {
      geradoEm: new Date().toISOString(),
      empresa:  tenant ?? { id: tenantId, nome: 'Empresa' },
      periodo:  { de, ate },
      supervisores,
      resumo: {
        totalVisitas:       visitas.length,
        concluidas:         concluidas.length,
        emAberto,
        saidasSemEntrada,
        tempoTotalMinutos:  tempoTotal,
        tempoMedioMinutos:  concluidas.length > 0 ? Math.round(tempoTotal / concluidas.length) : 0,
        pontosVisitados,
        supervisoresAtivos,
      },
      visitas,
    }
  })
}
