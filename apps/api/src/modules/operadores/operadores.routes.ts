import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { generateAgentKey } from '../field-api/field-api.utils.js'

async function gerarCodigoUnico(tenantId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const codigo = String(Math.floor(1000 + Math.random() * 9000))
    const existe = await prisma.operador.findFirst({ where: { tenantId, codigo } })
    if (!existe) return codigo
  }
  throw new Error('Não foi possível gerar código único para o operador')
}

export async function operadoresRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const vigs = await prisma.operador.findMany({
      where: { tenantId, ativo: true },
      select: {
        id: true, tenantId: true,
        nome: true, telefone: true, rfid: true,
        codigo: true, ativo: true, criadoEm: true,
        pontos: { select: { id: true, nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
    return vigs.map(v => ({ ...v, vigilanteId: v.codigo ?? v.id }))
  })

  app.post('/', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as {
      nome: string; telefone?: string; rfid?: string
      email?: string; senha?: string
    }

    const env = (process.env.AGENT_KEY_ENV ?? 'live') as 'live' | 'test'
    const codigo = await gerarCodigoUnico(tenantId)
    const operador = await prisma.operador.create({
      data: {
        tenantId,
        nome:      body.nome,
        telefone:  body.telefone,
        rfid:      body.rfid,
        codigo,
        agentKey:  generateAgentKey(env),
        agentKeyAt: new Date(),
      },
      include: { pontos: { select: { id: true, nome: true } } },
    })

    if (body.email && body.senha) {
      await prisma.usuario.create({
        data: {
          tenantId,
          nome:  body.nome,
          email: body.email,
          senha: await bcrypt.hash(body.senha, 12),
          papel: 'OPERADOR',
        },
      })
    }

    return reply.status(201).send(operador)
  })

  app.get('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const operador = await prisma.operador.findFirst({
      where: { id, tenantId },
      include: { pontos: { select: { id: true, nome: true } } },
    })
    if (!operador) return reply.status(404).send({ error: 'Operador não encontrado' })
    return operador
  })

  app.put('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const body = request.body as { nome?: string; telefone?: string; rfid?: string; ativo?: boolean }
    const operador = await prisma.operador.findFirst({ where: { id, tenantId } })
    if (!operador) return reply.status(404).send({ error: 'Operador não encontrado' })
    return prisma.operador.update({ where: { id }, data: body })
  })

  app.delete('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const operador = await prisma.operador.findFirst({ where: { id, tenantId } })
    if (!operador) return reply.status(404).send({ error: 'Operador não encontrado' })
    await prisma.operador.update({ where: { id }, data: { ativo: false } })
    return { success: true }
  })

  // ── codigo ───────────────────────────────────────────────────────────────────

  app.post('/:id/codigo/gerar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const operador = await prisma.operador.findFirst({ where: { id, tenantId } })
    if (!operador) return reply.status(404).send({ error: 'Operador não encontrado' })
    const codigo = await gerarCodigoUnico(tenantId)
    const updated = await prisma.operador.update({ where: { id }, data: { codigo }, select: { id: true, codigo: true } })
    return updated
  })

  // ── agentKey ─────────────────────────────────────────────────────────────────

  app.post('/:id/agentkey/regenerar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const operador = await prisma.operador.findFirst({ where: { id, tenantId } })
    if (!operador) return reply.status(404).send({ error: 'Operador não encontrado' })

    const env = (process.env.AGENT_KEY_ENV ?? 'live') as 'live' | 'test'
    const updated = await prisma.operador.update({
      where: { id },
      data: { agentKey: generateAgentKey(env), agentKeyAt: new Date() },
      select: { id: true, agentKey: true, agentKeyAt: true },
    })
    return updated
  })
}
