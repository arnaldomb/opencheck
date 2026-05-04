import type { FastifyInstance } from 'fastify'
import { prisma } from '@alerta-vigia/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'

export async function assinaturasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    return prisma.assinatura.findUnique({
      where: { tenantId },
      include: { plano: true },
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
