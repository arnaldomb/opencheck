import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { generateAgentKey } from '../field-api/field-api.utils.js'

async function gerarCodigoUnico(tenantId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const codigo = String(Math.floor(1000 + Math.random() * 9000))
    const existe = await prisma.supervisor.findFirst({ where: { tenantId, codigo } })
    if (!existe) return codigo
  }
  throw new Error('Não foi possível gerar código único para o supervisor')
}

export async function supervisoresRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    return prisma.supervisor.findMany({
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
  })

  app.post('/', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as { nome: string; telefone?: string }

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

  app.get('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const supervisor = await prisma.supervisor.findFirst({
      where: { id, tenantId },
      include: { pontos: { select: { id: true, nome: true } } },
    })
    if (!supervisor) return reply.status(404).send({ error: 'Supervisor não encontrado' })
    return supervisor
  })

  app.put('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const body = request.body as { nome?: string; telefone?: string; ativo?: boolean }
    const supervisor = await prisma.supervisor.findFirst({ where: { id, tenantId } })
    if (!supervisor) return reply.status(404).send({ error: 'Supervisor não encontrado' })
    return prisma.supervisor.update({ where: { id }, data: body })
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
