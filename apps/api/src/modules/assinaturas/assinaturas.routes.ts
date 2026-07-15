import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'

export async function assinaturasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Expõe apenas o necessário para checagem de limites no painel do cliente
  // (ex.: pontos/limite) — nome do plano, preço e faixas não são expostos ao
  // cliente, pois a conta pode ser revendida por terceiros com preço próprio.
  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    return prisma.assinatura.findUnique({
      where: { tenantId },
      select: {
        status: true, periodicidade: true, pontosContratados: true,
        trialAteEm: true, proximaCobrancaEm: true,
      },
    })
  })

  app.get('/cobrancas', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const assinatura = await prisma.assinatura.findUnique({ where: { tenantId } })
    if (!assinatura) return []
    return prisma.cobranca.findMany({
      where: { assinaturaId: assinatura.id },
      orderBy: { criadoEm: 'desc' },
      take: 6,
    })
  })
}
