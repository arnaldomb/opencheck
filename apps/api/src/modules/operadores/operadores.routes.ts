import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { generateAgentKey, gerarCodigoUnico, maskAgentKey } from '../field-api/field-api.utils.js'

const operadorCreateSchema = z.object({
  nome:     z.string().trim().min(1, 'Nome é obrigatório'),
  telefone: z.string().trim().optional(),
  rfid:     z.string().trim().optional(),
  email:    z.string().trim().email('Email inválido').optional(),
  senha:    z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').optional(),
})

const operadorUpdateSchema = z.object({
  nome:     z.string().trim().min(1).optional(),
  telefone: z.string().trim().optional(),
  rfid:     z.string().trim().optional(),
  ativo:    z.boolean().optional(),
})

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
    return vigs
  })

  app.post('/', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const parsed = operadorCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' })
    }
    const body = parsed.data

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
    return { ...operador, agentKey: maskAgentKey(operador.agentKey) }
  })

  app.put('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const parsed = operadorUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' })
    }
    const operador = await prisma.operador.findFirst({ where: { id, tenantId } })
    if (!operador) return reply.status(404).send({ error: 'Operador não encontrado' })
    const updated = await prisma.operador.update({ where: { id }, data: parsed.data })
    return { ...updated, agentKey: maskAgentKey(updated.agentKey) }
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
