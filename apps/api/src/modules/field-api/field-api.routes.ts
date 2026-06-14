import type { FastifyInstance } from 'fastify'
import { agentKeyMiddleware } from './field-api.middleware.js'
import {
  getConfig, getConfigCicloLeve, getStatus,
  registrarCheckin, dispararPanico, registrarFalha, iniciarCicloManual, pararCiclo,
} from './field-api.service.js'
import { registrarCheckin as registrarAberturaCheckin } from '../abertura/abertura.service.js'
import { prisma } from '@opencheck/database'

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

  // GET /operador/:operadorId/config — lookup by operador ID
  app.get('/operador/:operadorId/config', async (request, reply) => {
    const { operadorId } = request.params as { operadorId: string }
    const { tenantId } = request.agentCtx

    const operador = await prisma.operador.findFirst({
      where: { id: operadorId, tenantId, ativo: true },
      include: { pontos: { select: { id: true, nome: true, endereco: true, agentKey: true }, take: 1 } },
    })
    if (!operador) return reply.status(404).send({ erro: 'OPERADOR_NAO_ENCONTRADO', mensagem: 'Operador não encontrado neste tenant' })
    if (!operador.pontos[0]) return reply.status(400).send({ erro: 'SEM_PONTO', mensagem: 'Operador não vinculado a nenhum ponto' })

    const ctx = { tenantId, pontoId: operador.pontos[0].id, operadorId, tipo: 'OPERADOR' as const }
    const config = await getConfig(ctx)

    return {
      ...config,
      agentKeyPonto: operador.pontos[0].agentKey,
    }
  })

  // POST /abertura/checkin — abertura check-in via agentKey (app Windows)
  app.post('/abertura/checkin', async (request, reply) => {
    const { tenantId, pontoId, operadorId } = request.agentCtx
    const body = (request.body ?? {}) as { nomeComputador?: string; usuarioWindows?: string }
    try {
      const registro = await registrarAberturaCheckin(tenantId, pontoId, {
        operadorId: operadorId ?? undefined,
        nomeComputador: body.nomeComputador,
        usuarioWindows: body.usuarioWindows,
      })
      return reply.status(201).send(registro)
    } catch (err: unknown) {
      const e = err as { message: string; status?: number }
      return reply.status(e.status ?? 500).send({ aceito: false, erro: 'ABERTURA_FALHOU', mensagem: e.message })
    }
  })

  // GET /ponto/:pontoId/config — lookup by ponto ID
  app.get('/ponto/:pontoId/config', async (request, reply) => {
    const { pontoId } = request.params as { pontoId: string }
    const { tenantId } = request.agentCtx

    const ponto = await prisma.ponto.findFirst({ where: { id: pontoId, tenantId, ativo: true } })
    if (!ponto) return reply.status(404).send({ erro: 'PONTO_NAO_ENCONTRADO', mensagem: 'Ponto não encontrado' })

    return getConfig({ tenantId, pontoId, operadorId: null, tipo: 'PONTO' })
  })
}
