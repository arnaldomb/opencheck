import type { FastifyInstance } from 'fastify'
import { prisma } from '@alerta-vigia/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { verificarLimitePontos } from '../../middleware/assinatura.middleware.js'
import { generateAgentKey } from '../field-api/field-api.utils.js'
import { randomUUID } from 'crypto'

export async function pontosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    return prisma.ponto.findMany({ where: { tenantId }, orderBy: { criadoEm: 'desc' } })
  })

  app.post('/', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    await verificarLimitePontos(tenantId)

    const body = request.body as { nome: string; descricao?: string; endereco?: string }
    const env = (process.env.AGENT_KEY_ENV ?? 'live') as 'live' | 'test'
    const ponto = await prisma.ponto.create({
      data: { tenantId, ...body, agentKey: generateAgentKey(env), agentKeyAt: new Date() },
    })

    await prisma.onboardingStep.upsert({
      where: { tenantId },
      update: { ponto: true },
      create: { tenantId, ponto: true },
    })

    return reply.status(201).send(ponto)
  })

  app.get('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const ponto = await prisma.ponto.findFirst({
      where: { id, tenantId },
      include: { configCiclo: { include: { agendas: true } } },
    })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })
    return ponto
  })

  app.put('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    return prisma.ponto.update({ where: { id }, data: request.body as object })
  })

  app.delete('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    await prisma.ponto.update({ where: { id }, data: { ativo: false } })
    return { success: true }
  })

  // ── Ciclo (config por ponto) ─────────────────────────────────────────────────

  app.get('/:id/ciclo', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const specific = await prisma.configCiclo.findFirst({ where: { pontoId: id }, include: { agendas: true } })
    if (specific) return specific
    return prisma.configCiclo.findFirst({ where: { tenantId, pontoId: null }, include: { agendas: true } }) ?? null
  })

  app.put('/:id/ciclo', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const body = request.body as {
      duracaoMinutos?: number; toleranciaMinutos?: number; avisoAntesMin?: number
      codigoCheckin?: string; codigoPanico?: string; codigoFalha?: string
      capturarSnapshot?: boolean; autoReiniciar?: boolean; ativo?: boolean
    }

    let config = await prisma.configCiclo.findFirst({ where: { pontoId: id } })
    if (!config) {
      const padrao = await prisma.configCiclo.findFirst({ where: { tenantId, pontoId: null } })
      config = await prisma.configCiclo.create({
        data: {
          tenantId, pontoId: id, nome: ponto.nome,
          duracaoMinutos:    padrao?.duracaoMinutos    ?? 10,
          toleranciaMinutos: padrao?.toleranciaMinutos ?? 2,
          avisoAntesMin:     padrao?.avisoAntesMin     ?? 5,
          codigoCheckin:     padrao?.codigoCheckin     ?? '1602',
          codigoPanico:      padrao?.codigoPanico      ?? '1122',
          codigoFalha:       padrao?.codigoFalha       ?? '1130',
          capturarSnapshot:  padrao?.capturarSnapshot  ?? true,
          autoReiniciar:     padrao?.autoReiniciar     ?? true,
        },
      })
    }

    return prisma.configCiclo.update({ where: { id: config.id }, data: body })
  })

  // ── agentKey ────────────────────────────────────────────────────────────────

  app.post('/:id/agentkey/regenerar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const env = (process.env.AGENT_KEY_ENV ?? 'live') as 'live' | 'test'
    const updated = await prisma.ponto.update({
      where: { id },
      data: { agentKey: generateAgentKey(env), agentKeyAt: new Date() },
      select: { id: true, agentKey: true, agentKeyAt: true },
    })
    return updated
  })

  // ── Agendas (turnos de operação) ─────────────────────────────────────────────

  app.get('/:id/agendas', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const specific = await prisma.configCiclo.findFirst({ where: { pontoId: id }, include: { agendas: true } })
    if (specific) return specific.agendas
    const padrao = await prisma.configCiclo.findFirst({ where: { tenantId, pontoId: null }, include: { agendas: true } })
    return padrao?.agendas ?? []
  })

  app.post('/:id/agendas', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const body = request.body as { diasSemana: number[]; horaInicio: string; horaFim: string }

    // Get or create ponto-specific ConfigCiclo
    let config = await prisma.configCiclo.findFirst({ where: { pontoId: id } })
    if (!config) {
      // Clone from tenant default
      const padrao = await prisma.configCiclo.findFirst({ where: { tenantId, pontoId: null } })
      config = await prisma.configCiclo.create({
        data: {
          tenantId,
          pontoId: id,
          nome: ponto.nome,
          duracaoMinutos:    padrao?.duracaoMinutos    ?? 10,
          toleranciaMinutos: padrao?.toleranciaMinutos ?? 2,
          avisoAntesMin:     padrao?.avisoAntesMin     ?? 5,
          codigoCheckin:     padrao?.codigoCheckin     ?? '1602',
          codigoPanico:      padrao?.codigoPanico      ?? '1122',
          codigoFalha:       padrao?.codigoFalha       ?? '1130',
          capturarSnapshot:  padrao?.capturarSnapshot  ?? true,
          autoReiniciar:     padrao?.autoReiniciar      ?? true,
        },
      })
    }

    const agenda = await prisma.agendaCiclo.create({
      data: { configId: config.id, ...body },
    })
    return reply.status(201).send(agenda)
  })

  app.put('/:id/agendas/:agendaId', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id, agendaId } = request.params as { id: string; agendaId: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const agenda = await prisma.agendaCiclo.findFirst({
      where: { id: agendaId, config: { pontoId: id } },
    })
    if (!agenda) return reply.status(404).send({ error: 'Agenda não encontrada' })

    const body = request.body as { diasSemana?: number[]; horaInicio?: string; horaFim?: string; ativo?: boolean }
    return prisma.agendaCiclo.update({ where: { id: agendaId }, data: body })
  })

  app.delete('/:id/agendas/:agendaId', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id, agendaId } = request.params as { id: string; agendaId: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const agenda = await prisma.agendaCiclo.findFirst({
      where: { id: agendaId, config: { pontoId: id } },
    })
    if (!agenda) return reply.status(404).send({ error: 'Agenda não encontrada' })

    await prisma.agendaCiclo.delete({ where: { id: agendaId } })
    return { success: true }
  })

  // ── Vigilantes (vincular / desvincular) ─────────────────────────────────────

  app.post('/:id/vigilantes/:vigilanteId', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id, vigilanteId } = request.params as { id: string; vigilanteId: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })
    const vigilante = await prisma.vigilante.findFirst({ where: { id: vigilanteId, tenantId } })
    if (!vigilante) return reply.status(404).send({ error: 'Vigilante não encontrado' })
    await prisma.ponto.update({ where: { id }, data: { vigilantes: { connect: { id: vigilanteId } } } })
    return { success: true }
  })

  app.delete('/:id/vigilantes/:vigilanteId', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id, vigilanteId } = request.params as { id: string; vigilanteId: string }
    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })
    await prisma.ponto.update({ where: { id }, data: { vigilantes: { disconnect: { id: vigilanteId } } } })
    return { success: true }
  })

  // ── CTRL+SAFE por ponto ──────────────────────────────────────────────────────

  app.post('/:id/ctrlsafe/ativar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const body = request.body as { licenseKey?: string }

    const ponto = await prisma.ponto.findFirst({ where: { id, tenantId } })
    if (!ponto) return reply.status(404).send({ error: 'Ponto não encontrado' })

    const licenseKey = body.licenseKey ?? ponto.ctrlsafeLicenseKey
    if (!licenseKey) return reply.status(400).send({ error: 'Chave de licença não informada.' })

    const installationId = ponto.ctrlsafeInstallId ?? randomUUID()
    const machineName = `${ponto.nome} — Alerta Vigia`
    const machineFingerprint = installationId.replace(/-/g, '').slice(0, 12)

    const { activateCtrlSafe } = await import('../../infra/ctrlsafe/ctrlsafe.service.js')
    await prisma.ponto.update({
      where: { id },
      data: { ctrlsafeLicenseKey: licenseKey, ctrlsafeInstallId: installationId },
    })

    const result = await activateCtrlSafe(licenseKey, installationId, machineName, machineFingerprint)

    await prisma.ponto.update({
      where: { id },
      data: { ctrlsafeAgentToken: result.agentToken },
    })

    return { ok: true, licenseStatus: result.licenseStatus }
  })
}
