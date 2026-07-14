import type { FastifyInstance } from 'fastify'
import { prisma } from '@opencheck/database'
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

  // Tabela de faixas de preço (pacotes) para exibição na área do cliente —
  // somente leitura; o cadastro é feito exclusivamente no painel superadmin.
  app.get('/pacotes', async () => {
    return prisma.plano.findMany({
      where: { ativo: true },
      orderBy: { ordem: 'asc' },
      select: { id: true, nome: true, faixaMin: true, faixaMax: true, precoConta: true, ordem: true },
    })
  })
}
