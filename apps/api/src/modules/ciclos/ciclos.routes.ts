import type { FastifyInstance } from 'fastify'
import { prisma } from '@alerta-vigia/database'
import { authMiddleware } from '../../middleware/auth.middleware.js'
import { cicloAlertaQueue } from '../../infra/redis/queues.js'
import { getConfigCiclo, getExecucaoAtiva } from '../field-api/field-api.utils.js'
import { iniciarCicloManual } from '../field-api/field-api.service.js'

export async function ciclosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/padrao', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    return prisma.configCiclo.findFirst({ where: { tenantId, pontoId: null } })
  })

  app.put('/padrao', async (request) => {
    const { tenantId } = request.user as { tenantId: string }
    const body = request.body as object
    const existing = await prisma.configCiclo.findFirst({ where: { tenantId, pontoId: null } })
    if (existing) {
      return prisma.configCiclo.update({ where: { id: existing.id }, data: body })
    }
    return prisma.configCiclo.create({ data: { tenantId, ...(body as Record<string, unknown>) } })
  })
}

// Rota de checkin (prefixo /checkin no app principal)
export async function checkinRoute(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string }
    const { pontoId } = request.body as { pontoId: string }

    const execucao = await prisma.execucaoCiclo.findFirst({
      where: { pontoId, status: 'EM_ANDAMENTO' },
    })

    if (!execucao) return reply.status(404).send({ error: 'Nenhum ciclo ativo para este ponto' })

    await prisma.execucaoCiclo.update({
      where: { id: execucao.id },
      data: { status: 'CONCLUIDO', finalizadoEm: new Date(), checkinEm: new Date() },
    })

    await prisma.evento.create({
      data: { tenantId, pontoId, tipo: 'CHECKIN' },
    })

    // Cancelar jobs de aviso/expiração pendentes
    if (execucao.avisoJobId) await cicloAlertaQueue.remove(execucao.avisoJobId)
    if (execucao.expiraJobId) await cicloAlertaQueue.remove(execucao.expiraJobId)

    return { success: true }
  })
}
