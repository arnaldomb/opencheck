import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { generateAgentKey, gerarCodigoUnico, maskAgentKey } from '../field-api/field-api.utils.js'
import { getRondas } from './supervisores.service.js'

const supervisorCreateSchema = z.object({
  nome:     z.string().trim().min(1, 'Nome é obrigatório'),
  telefone: z.string().trim().optional(),
})

const supervisorUpdateSchema = z.object({
  nome:     z.string().trim().min(1).optional(),
  telefone: z.string().trim().optional(),
  ativo:    z.boolean().optional(),
})

export async function supervisoresRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const supervisores = await prisma.supervisor.findMany({
      where: { tenantId, ativo: true },
      select: {
        id: true, tenantId: true,
        nome: true, telefone: true,
        codigo: true, ativo: true, criadoEm: true,
        agentKey: true, agentKeyAt: true,
        pontos: { select: { id: true, nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    return supervisores.map(s => ({ ...s, agentKey: maskAgentKey(s.agentKey) }))
  })

  app.post('/', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const parsed = supervisorCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' })
    }
    const body = parsed.data

    const env = (process.env.AGENT_KEY_ENV ?? 'live') as 'live' | 'test'
    const codigo = await gerarCodigoUnico(tenantId)
    const supervisor = await prisma.supervisor.create({
      data: {
        tenantId,
        nome:      body.nome,
        telefone:  body.telefone,
        codigo,
        agentKey:  generateAgentKey(env),
        agentKeyAt: new Date(),
      },
      include: { pontos: { select: { id: true, nome: true } } },
    })
    return reply.status(201).send(supervisor)
  })

  // GET /rondas — visitas de supervisão (entrada→saída pareadas)
  app.get('/rondas', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const query = request.query as { supervisorId?: string; pontoId?: string; dataInicio?: string; dataFim?: string }

    const dataFim = query.dataFim ? new Date(`${query.dataFim}T23:59:59.999-03:00`) : new Date()
    const dataInicio = query.dataInicio
      ? new Date(`${query.dataInicio}T00:00:00.000-03:00`)
      : new Date(dataFim.getTime() - 7 * 24 * 60 * 60 * 1000)

    const visitas = await getRondas(tenantId, {
      supervisorId: query.supervisorId,
      pontoId:      query.pontoId,
      dataInicio, dataFim,
    })

    return { visitas, periodo: { dataInicio, dataFim } }
  })

  app.get('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const supervisor = await prisma.supervisor.findFirst({
      where: { id, tenantId },
      include: { pontos: { select: { id: true, nome: true } } },
    })
    if (!supervisor) return reply.status(404).send({ error: 'Supervisor não encontrado' })
    return { ...supervisor, agentKey: maskAgentKey(supervisor.agentKey) }
  })

  app.put('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const parsed = supervisorUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' })
    }
    const supervisor = await prisma.supervisor.findFirst({ where: { id, tenantId } })
    if (!supervisor) return reply.status(404).send({ error: 'Supervisor não encontrado' })
    const updated = await prisma.supervisor.update({ where: { id }, data: parsed.data })
    return { ...updated, agentKey: maskAgentKey(updated.agentKey) }
  })

  app.delete('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const supervisor = await prisma.supervisor.findFirst({ where: { id, tenantId } })
    if (!supervisor) return reply.status(404).send({ error: 'Supervisor não encontrado' })
    await prisma.supervisor.update({ where: { id }, data: { ativo: false } })
    return { success: true }
  })

  // POST /:id/pontos — vincular pontos ao supervisor
  app.post('/:id/pontos', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const { pontoIds } = request.body as { pontoIds: string[] }

    const supervisor = await prisma.supervisor.findFirst({ where: { id, tenantId } })
    if (!supervisor) return reply.status(404).send({ error: 'Supervisor não encontrado' })

    const updated = await prisma.supervisor.update({
      where: { id },
      data: { pontos: { set: pontoIds.map(pid => ({ id: pid })) } },
      include: { pontos: { select: { id: true, nome: true } } },
    })
    return updated
  })

  // POST /:id/agentkey/regenerar — gerar nova agentKey
  app.post('/:id/agentkey/regenerar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const supervisor = await prisma.supervisor.findFirst({ where: { id, tenantId } })
    if (!supervisor) return reply.status(404).send({ error: 'Supervisor não encontrado' })

    const env = (process.env.AGENT_KEY_ENV ?? 'live') as 'live' | 'test'
    const updated = await prisma.supervisor.update({
      where: { id },
      data: { agentKey: generateAgentKey(env), agentKeyAt: new Date() },
      select: { id: true, agentKey: true, agentKeyAt: true },
    })
    return updated
  })
}
