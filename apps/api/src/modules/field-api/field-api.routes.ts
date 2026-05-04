import type { FastifyInstance } from 'fastify'
import { agentKeyMiddleware } from './field-api.middleware.js'
import {
  getConfig, getConfigCicloLeve, getStatus,
  registrarCheckin, dispararPanico, registrarFalha, iniciarCicloManual, pararCiclo,
} from './field-api.service.js'
import { prisma } from '@alerta-vigia/database'

export async function fieldApiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', agentKeyMiddleware)

  // GET /config — full config for app initialization
  app.get('/config', async (request) => {
    return getConfig(request.agentCtx)
  })

  // GET /config/ciclo — lightweight polling endpoint
  app.get('/config/ciclo', async (request) => {
    return getConfigCicloLeve(request.agentCtx)
  })

  // GET /status — current cycle state and timer
  app.get('/status', async (request) => {
    return getStatus(request.agentCtx)
  })

  // POST /checkin — guard registers check-in
  app.post('/checkin', async (request) => {
    const body = (request.body ?? {}) as { vigilanteId?: string; observacao?: string }
    return registrarCheckin(request.agentCtx, body)
  })

  // POST /panico — panic / silent panic / coercion
  app.post('/panico', async (request, reply) => {
    const body = (request.body ?? {}) as {
      tipo?: 'PANICO' | 'PANICO_SILENCIOSO' | 'COACAO'
      observacao?: string
      vigilanteId?: string
    }
    const tipos = ['PANICO', 'PANICO_SILENCIOSO', 'COACAO']
    if (body.tipo && !tipos.includes(body.tipo)) {
      return reply.status(400).send({ erro: 'TIPO_PANICO_INVALIDO', mensagem: 'Tipo deve ser PANICO, PANICO_SILENCIOSO ou COACAO' })
    }
    return dispararPanico(request.agentCtx, body)
  })

  // POST /falha — device malfunction
  app.post('/falha', async (request) => {
    const body = (request.body ?? {}) as { observacao?: string; vigilanteId?: string }
    return registrarFalha(request.agentCtx, body)
  })

  // POST /ciclo/iniciar — manually start a cycle
  app.post('/ciclo/iniciar', async (request) => {
    return iniciarCicloManual(request.agentCtx)
  })

  // POST /ciclo/parar — stop active cycle
  app.post('/ciclo/parar', async (request) => {
    return pararCiclo(request.agentCtx)
  })

  // GET /vigilante/:vigilanteId/config — lookup by guard ID
  app.get('/vigilante/:vigilanteId/config', async (request, reply) => {
    const { vigilanteId } = request.params as { vigilanteId: string }
    const { tenantId } = request.agentCtx

    const vigilante = await prisma.vigilante.findFirst({
      where: { id: vigilanteId, tenantId, ativo: true },
      include: { pontos: { select: { id: true, nome: true, endereco: true, agentKey: true }, take: 1 } },
    })
    if (!vigilante) return reply.status(404).send({ erro: 'VIGILANTE_NAO_ENCONTRADO', mensagem: 'Vigilante não encontrado neste tenant' })
    if (!vigilante.pontos[0]) return reply.status(400).send({ erro: 'SEM_PONTO', mensagem: 'Vigilante não vinculado a nenhum ponto' })

    const ctx = { tenantId, pontoId: vigilante.pontos[0].id, vigilanteId, tipo: 'VIGILANTE' as const }
    const config = await getConfig(ctx)

    return {
      ...config,
      agentKeyPonto: vigilante.pontos[0].agentKey,
    }
  })

  // GET /ponto/:pontoId/config — lookup by ponto ID
  app.get('/ponto/:pontoId/config', async (request, reply) => {
    const { pontoId } = request.params as { pontoId: string }
    const { tenantId } = request.agentCtx

    const ponto = await prisma.ponto.findFirst({ where: { id: pontoId, tenantId, ativo: true } })
    if (!ponto) return reply.status(404).send({ erro: 'PONTO_NAO_ENCONTRADO', mensagem: 'Ponto não encontrado' })

    return getConfig({ tenantId, pontoId, vigilanteId: null, tipo: 'PONTO' })
  })
}
