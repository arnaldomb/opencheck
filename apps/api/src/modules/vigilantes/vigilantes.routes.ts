import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '@alerta-vigia/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { generateAgentKey } from '../field-api/field-api.utils.js'

async function gerarCodigoUnico(tenantId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const codigo = String(Math.floor(1000 + Math.random() * 9000))
    const existe = await prisma.vigilante.findFirst({ where: { tenantId, codigo } })
    if (!existe) return codigo
  }
  throw new Error('Não foi possível gerar código único para o vigilante')
}

export async function vigilantesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const vigs = await prisma.vigilante.findMany({
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
    const vigilante = await prisma.vigilante.create({
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

    return reply.status(201).send(vigilante)
  })

  app.get('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const vigilante = await prisma.vigilante.findFirst({
      where: { id, tenantId },
      include: { pontos: { select: { id: true, nome: true } } },
    })
    if (!vigilante) return reply.status(404).send({ error: 'Vigilante não encontrado' })
    return vigilante
  })

  app.put('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const body = request.body as { nome?: string; telefone?: string; rfid?: string; ativo?: boolean }
    const vigilante = await prisma.vigilante.findFirst({ where: { id, tenantId } })
    if (!vigilante) return reply.status(404).send({ error: 'Vigilante não encontrado' })
    return prisma.vigilante.update({ where: { id }, data: body })
  })

  app.delete('/:id', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const vigilante = await prisma.vigilante.findFirst({ where: { id, tenantId } })
    if (!vigilante) return reply.status(404).send({ error: 'Vigilante não encontrado' })
    await prisma.vigilante.update({ where: { id }, data: { ativo: false } })
    return { success: true }
  })

  // ── codigo ───────────────────────────────────────────────────────────────────

  app.post('/:id/codigo/gerar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const vigilante = await prisma.vigilante.findFirst({ where: { id, tenantId } })
    if (!vigilante) return reply.status(404).send({ error: 'Vigilante não encontrado' })
    const codigo = await gerarCodigoUnico(tenantId)
    const updated = await prisma.vigilante.update({ where: { id }, data: { codigo }, select: { id: true, codigo: true } })
    return updated
  })

  // ── agentKey ─────────────────────────────────────────────────────────────────

  app.post('/:id/agentkey/regenerar', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { id } = request.params as { id: string }
    const vigilante = await prisma.vigilante.findFirst({ where: { id, tenantId } })
    if (!vigilante) return reply.status(404).send({ error: 'Vigilante não encontrado' })

    const env = (process.env.AGENT_KEY_ENV ?? 'live') as 'live' | 'test'
    const updated = await prisma.vigilante.update({
      where: { id },
      data: { agentKey: generateAgentKey(env), agentKeyAt: new Date() },
      select: { id: true, agentKey: true, agentKeyAt: true },
    })
    return updated
  })
}
