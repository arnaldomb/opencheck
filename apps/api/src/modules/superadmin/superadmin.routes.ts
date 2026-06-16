import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '@opencheck/database'
import { superadminMiddleware } from '../../middleware/auth.middleware.js'
import { criarAssinatura, upgradePlano, cancelarAssinatura } from '../assinaturas/assinatura.service.js'

export async function superadminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', superadminMiddleware)

  // ── Clientes ─────────────────────────────────────────────────────────────
  app.get('/clientes', async (request) => {
    const { status, planoId } = request.query as Record<string, string>
    return prisma.tenant.findMany({
      where: {
        ...(status === 'ativo' ? { ativo: true } : {}),
        ...(planoId ? { assinatura: { planoId } } : {}),
      },
      include: { assinatura: { include: { plano: true } } },
      orderBy: { criadoEm: 'desc' },
    })
  })

  app.post('/clientes', async (request, reply) => {
    const body = request.body as {
      nome: string; email: string; cnpj?: string; telefone?: string;
      adminNome: string; adminEmail: string; adminSenha: string
    }

    const tenant = await prisma.tenant.create({
      data: {
        nome: body.nome,
        email: body.email,
        cnpj: body.cnpj,
        telefone: body.telefone,
        usuarios: {
          create: {
            nome: body.adminNome,
            email: body.adminEmail,
            senha: await bcrypt.hash(body.adminSenha, 12),
            papel: 'ADMIN',
          },
        },
        onboarding: { create: {} },
      },
    })
    return reply.status(201).send(tenant)
  })

  app.get('/clientes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { assinatura: { include: { plano: true } }, onboarding: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Cliente não encontrado' })
    return tenant
  })

  app.put('/clientes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    return prisma.tenant.update({ where: { id }, data: request.body as object })
  })

  // ── Assinaturas ───────────────────────────────────────────────────────────
  app.post('/clientes/:id/assinatura', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Parameters<typeof criarAssinatura>[2] & { planoId: string }
    const assinatura = await criarAssinatura(id, body.planoId, body)
    return reply.status(201).send(assinatura)
  })

  app.put('/clientes/:id/assinatura/upgrade', async (request) => {
    const { id } = request.params as { id: string }
    const { planoId } = request.body as { planoId: string }
    await upgradePlano(id, planoId)
    return { success: true }
  })

  app.delete('/clientes/:id/assinatura', async (request) => {
    const { id } = request.params as { id: string }
    await cancelarAssinatura(id)
    return { success: true }
  })

  app.get('/clientes/:id/assinatura/cobrancas', async (request, reply) => {
    const { id } = request.params as { id: string }
    const assinatura = await prisma.assinatura.findUnique({ where: { tenantId: id } })
    if (!assinatura) return reply.status(404).send({ error: 'Sem assinatura' })
    return prisma.cobranca.findMany({
      where: { assinaturaId: assinatura.id },
      orderBy: { criadoEm: 'desc' },
    })
  })

  // ── Planos ────────────────────────────────────────────────────────────────
  app.get('/planos', async () => prisma.plano.findMany({ where: { ativo: true } }))

  app.post('/planos', async (request, reply) => {
    const body = request.body as { nome: string; descricao?: string; valorMensal: number; valorAnual?: number; pontosIncluidos: number; limiteCameras?: number; limiteUsuarios?: number }
    const plano = await prisma.plano.create({ data: body })
    return reply.status(201).send(plano)
  })

  app.put('/planos/:id', async (request) => {
    const { id } = request.params as { id: string }
    return prisma.plano.update({ where: { id }, data: request.body as object })
  })

  // ── Configuração global de eventos (códigos CTRL+SAFE por TipoEvento) ────────
  app.get('/eventos-config', async () => {
    const cfg = await prisma.configEventoGlobal.findUnique({ where: { id: 'global' } })
    if (!cfg) {
      return prisma.configEventoGlobal.create({
        data: { id: 'global' },
      })
    }
    return cfg
  })

  app.put('/eventos-config', async (request) => {
    const body = request.body as { codigos?: Record<string, string>; tiposCtrlSafe?: Record<string, string> }
    return prisma.configEventoGlobal.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...body },
      update: body,
    })
  })

  // ── Overview ──────────────────────────────────────────────────────────────
  app.get('/overview', async () => {
    const [totalTenants, totalAtivos, totalInadimplentes, totalReceita] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { ativo: true } }),
      prisma.assinatura.count({ where: { status: 'INADIMPLENTE' } }),
      prisma.cobranca.aggregate({ _sum: { valor: true }, where: { status: { in: ['CONFIRMADA', 'RECEBIDA'] } } }),
    ])
    return { totalTenants, totalAtivos, totalInadimplentes, totalReceita: totalReceita._sum.valor ?? 0 }
  })
}
