import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'

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
}
