import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { registrarCheckin, getStatus, getHistorico, getRanking, reagendarDeadlineHojeDoPonto } from './abertura.service.js'

export async function aberturaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ── Config de abertura por ponto ──────────────────────────────────────────

  app.put('/config/:pontoId', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { pontoId } = request.params as { pontoId: string }
    const body = request.body as {
      emailAlerta?: string
      ativo?: boolean
      turnos: { diasSemana: number[]; horaAbertura: string; toleranciaMinutos?: number }[]
    }

    const ponto = await prisma.ponto.findFirst({ where: { id: pontoId, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const config = await prisma.configAbertura.upsert({
      where: { pontoId },
      update: {
        emailAlerta: body.emailAlerta ?? null,
        ativo: body.ativo ?? true,
      },
      create: {
        tenantId, pontoId,
        emailAlerta: body.emailAlerta ?? null,
        ativo: body.ativo ?? true,
      },
    })

    // Substituir turnos atomicamente
    await prisma.turnoAbertura.deleteMany({ where: { configId: config.id } })

    if (body.turnos?.length) {
      await prisma.turnoAbertura.createMany({
        data: body.turnos.map(t => ({
          configId: config.id,
          diasSemana: t.diasSemana,
          horaAbertura: t.horaAbertura,
          toleranciaMinutos: t.toleranciaMinutos ?? 30,
        })),
      })
    }

    const result = await prisma.configAbertura.findUnique({
      where: { id: config.id },
      include: { turnos: { orderBy: { criadoEm: 'asc' } } },
    })

    await reagendarDeadlineHojeDoPonto(tenantId, pontoId)

    return result
  })

  app.get('/config/:pontoId', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { pontoId } = request.params as { pontoId: string }

    const ponto = await prisma.ponto.findFirst({ where: { id: pontoId, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const config = await prisma.configAbertura.findUnique({
      where: { pontoId },
      include: { turnos: { orderBy: { criadoEm: 'asc' } } },
    })
    if (!config) return reply.status(404).send({ error: 'Configuração não encontrada' })
    return config
  })

  // ── Check-in ──────────────────────────────────────────────────────────────

  app.post('/checkin', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as {
      pontoId: string
      operadorId?: string
      nomeComputador?: string
      usuarioWindows?: string
    }

    try {
      const registro = await registrarCheckin(tenantId, body.pontoId, {
        operadorId:     body.operadorId,
        nomeComputador: body.nomeComputador,
        usuarioWindows: body.usuarioWindows,
      })
      return reply.status(201).send(registro)
    } catch (err: unknown) {
      const e = err as { message: string; status?: number }
      return reply.status(e.status ?? 500).send({ error: e.message })
    }
  })

  // ── Status do dia ─────────────────────────────────────────────────────────

  app.get('/status', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    return getStatus(tenantId)
  })

  // ── Histórico ─────────────────────────────────────────────────────────────

  app.get('/historico', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const {
      pontoId, status, dataInicio, dataFim,
      page = '1', limit = '50',
    } = request.query as Record<string, string>

    return getHistorico(tenantId, {
      pontoId, status, dataInicio, dataFim,
      page: Number(page), limit: Number(limit),
    })
  })

  // ── Ranking de conformidade ───────────────────────────────────────────────

  app.get('/ranking', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const { dias = '30' } = request.query as { dias?: string }
    return getRanking(tenantId, Number(dias))
  })
}
