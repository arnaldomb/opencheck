import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { agentKeyMiddleware, type AgentContext } from './field-api.middleware.js'
import {
  getConfig, getConfigCicloLeve, getStatus,
  registrarCheckin, dispararPanico, registrarFalha, iniciarCicloManual, pararCiclo,
  registrarEntradaSupervisor, registrarSaidaSupervisor,
} from './field-api.service.js'
import { resolverCodigo, type AtorCodigo } from './field-api.utils.js'
import {
  registrarCheckin as registrarAberturaCheckin,
  registrarFechamento as registrarFechamentoCheckin,
} from '../abertura/abertura.service.js'
import { prisma } from '@opencheck/database'

const aberturaBodySchema = z.object({
  codigo:         z.string().trim().regex(/^\d{4}$/, 'Código deve ter 4 dígitos'),
  nomeComputador: z.string().trim().max(200).optional(),
  usuarioWindows: z.string().trim().max(200).optional(),
})

class FieldApiError extends Error {
  constructor(public status: number, public erro: string, mensagem: string) {
    super(mensagem)
  }
}

function enviarErro(reply: FastifyReply, err: unknown) {
  if (err instanceof FieldApiError) {
    return reply.status(err.status).send({ aceito: false, erro: err.erro, mensagem: err.message })
  }
  const e = err as { message?: string; status?: number; erro?: string }
  return reply.status(e.status ?? 500).send({ aceito: false, erro: e.erro ?? 'OPERACAO_FALHOU', mensagem: e.message ?? 'Erro interno' })
}

// Resolve quem está registrando a partir do código de 4 dígitos (operador ou supervisor).
async function resolverAtor(ctx: AgentContext, codigo: string): Promise<AtorCodigo> {
  const ator = await resolverCodigo(ctx.tenantId, codigo)
  if (!ator) throw new FieldApiError(404, 'CODIGO_NAO_ENCONTRADO', 'Código não encontrado para operador ou supervisor')
  return ator
}

// A loja é sempre a da agentKey — o app nunca escolhe ponto.
async function resolverPontoOperacao(ctx: AgentContext): Promise<{ id: string; nome: string }> {
  const ponto = await prisma.ponto.findFirst({
    where: { id: ctx.pontoId, tenantId: ctx.tenantId },
    select: { id: true, nome: true },
  })
  if (!ponto) throw new FieldApiError(404, 'PONTO_NAO_ENCONTRADO', 'Ponto não encontrado')
  return ponto
}

function horaSP(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

function descreverAtor(ator: AtorCodigo | null): string {
  if (!ator) return ''
  return ` por ${ator.nome} (${ator.tipo === 'SUPERVISOR' ? 'Supervisor' : 'Operador'})`
}

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
    const body = (request.body ?? {}) as { operadorId?: string; observacao?: string }
    return registrarCheckin(request.agentCtx, body)
  })

  // POST /panico — panic / silent panic / coercion
  app.post('/panico', async (request, reply) => {
    const body = (request.body ?? {}) as {
      tipo?: 'PANICO' | 'PANICO_SILENCIOSO' | 'COACAO'
      observacao?: string
      operadorId?: string
    }
    const tipos = ['PANICO', 'PANICO_SILENCIOSO', 'COACAO']
    if (body.tipo && !tipos.includes(body.tipo)) {
      return reply.status(400).send({ erro: 'TIPO_PANICO_INVALIDO', mensagem: 'Tipo deve ser PANICO, PANICO_SILENCIOSO ou COACAO' })
    }
    return dispararPanico(request.agentCtx, body)
  })

  // POST /falha — device malfunction
  app.post('/falha', async (request) => {
    const body = (request.body ?? {}) as { observacao?: string; operadorId?: string }
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

    const ctx = { tenantId, pontoId: operador.pontos[0].id, operadorId, supervisorId: null, tipo: 'OPERADOR' as const }
    const config = await getConfig(ctx)

    return {
      ...config,
      agentKeyPonto: operador.pontos[0].agentKey,
    }
  })

  // GET /abertura/codigo/:codigo — pré-validação: identifica o dono do código
  // antes do check-in, para o app confirmar "Registrar como Fulano?"
  app.get('/abertura/codigo/:codigo', async (request, reply) => {
    const { codigo } = request.params as { codigo: string }
    const ator = await resolverCodigo(request.agentCtx.tenantId, codigo)
    if (!ator) {
      return reply.status(404).send({ valido: false, erro: 'CODIGO_NAO_ENCONTRADO', mensagem: 'Código não encontrado para operador ou supervisor' })
    }
    return { valido: true, ator }
  })

  // POST /abertura/checkin — botão "Check-in" do app Windows.
  // Body: { codigo, pontoId?, nomeComputador?, usuarioWindows? }
  // O código de 4 dígitos decide o fluxo: operador → abertura de loja (com prazo);
  // supervisor → entrada de visita de supervisão (sem prazo, não é uma ronda).
  app.post('/abertura/checkin', async (request, reply) => {
    const parsed = aberturaBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ aceito: false, erro: 'DADOS_INVALIDOS', mensagem: parsed.error.issues[0]?.message ?? 'Dados inválidos' })
    }
    const body = parsed.data

    try {
      const [ator, ponto] = await Promise.all([
        resolverAtor(request.agentCtx, body.codigo),
        resolverPontoOperacao(request.agentCtx),
      ])

      if (ator.tipo === 'SUPERVISOR') {
        const registro = await registrarEntradaSupervisor(
          { ...request.agentCtx, pontoId: ponto.id, operadorId: null, supervisorId: ator.id, tipo: 'SUPERVISOR' },
          { pontoId: ponto.id, ip: request.ip, userAgent: request.headers['user-agent'] },
        )
        return reply.status(201).send({
          aceito:        true,
          tipo:          'ENTRADA',
          registradoEm:  registro.registradoEm,
          ponto:         { id: ponto.id, nome: ponto.nome },
          registradoPor: ator,
          mensagem: `Entrada de ${ator.nome} em ${ponto.nome} às ${horaSP(registro.registradoEm)}`,
        })
      }

      const registro = await registrarAberturaCheckin(request.agentCtx.tenantId, ponto.id, {
        operadorId:     ator.id,
        nomeComputador: body.nomeComputador,
        usuarioWindows: body.usuarioWindows,
      })

      const noPrazo = registro.status === 'NO_PRAZO'
      return reply.status(201).send({
        aceito:        true,
        tipo:          'ABERTURA',
        status:        registro.status,
        registradoEm:  registro.abertaEm,
        deadlineEm:    registro.deadlineEm,
        ponto:         { id: ponto.id, nome: ponto.nome },
        registradoPor: ator,
        mensagem: `Abertura de ${ponto.nome} registrada${descreverAtor(ator)} às ${horaSP(registro.abertaEm!)} — ${noPrazo ? 'no prazo' : 'em atraso'}`,
      })
    } catch (err) {
      return enviarErro(reply, err)
    }
  })

  // POST /abertura/fechamento — botão "Check-out" do app Windows.
  // Body: { codigo, pontoId?, nomeComputador?, usuarioWindows? }
  // Operador → fechamento de loja (com prazo); supervisor → saída da visita de supervisão.
  app.post('/abertura/fechamento', async (request, reply) => {
    const parsed = aberturaBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ aceito: false, erro: 'DADOS_INVALIDOS', mensagem: parsed.error.issues[0]?.message ?? 'Dados inválidos' })
    }
    const body = parsed.data

    try {
      const [ator, ponto] = await Promise.all([
        resolverAtor(request.agentCtx, body.codigo),
        resolverPontoOperacao(request.agentCtx),
      ])

      if (ator.tipo === 'SUPERVISOR') {
        const registro = await registrarSaidaSupervisor(
          { ...request.agentCtx, pontoId: ponto.id, operadorId: null, supervisorId: ator.id, tipo: 'SUPERVISOR' },
          { pontoId: ponto.id, ip: request.ip, userAgent: request.headers['user-agent'] },
        )
        return reply.status(201).send({
          aceito:        true,
          tipo:          'SAIDA',
          registradoEm:  registro.registradoEm,
          ponto:         { id: ponto.id, nome: ponto.nome },
          registradoPor: ator,
          mensagem: `Saída de ${ator.nome} de ${ponto.nome} às ${horaSP(registro.registradoEm)}`,
        })
      }

      const registro = await registrarFechamentoCheckin(request.agentCtx.tenantId, ponto.id, {
        operadorId:     ator.id,
        nomeComputador: body.nomeComputador,
        usuarioWindows: body.usuarioWindows,
      })

      const noPrazo = registro.statusFechamento === 'NO_PRAZO'
      return reply.status(201).send({
        aceito:        true,
        tipo:          'FECHAMENTO',
        status:        registro.statusFechamento,
        registradoEm:  registro.fechamentoEm,
        ponto:         { id: ponto.id, nome: ponto.nome },
        registradoPor: ator,
        mensagem: `Fechamento de ${ponto.nome} registrado${descreverAtor(ator)} às ${horaSP(registro.fechamentoEm!)} — ${noPrazo ? 'no prazo' : 'em atraso'}`,
      })
    } catch (err) {
      return enviarErro(reply, err)
    }
  })

  // GET /ponto/:pontoId/config — lookup by ponto ID
  app.get('/ponto/:pontoId/config', async (request, reply) => {
    const { pontoId } = request.params as { pontoId: string }
    const { tenantId } = request.agentCtx

    const ponto = await prisma.ponto.findFirst({ where: { id: pontoId, tenantId, ativo: true } })
    if (!ponto) return reply.status(404).send({ erro: 'PONTO_NAO_ENCONTRADO', mensagem: 'Ponto não encontrado' })

    return getConfig({ tenantId, pontoId, operadorId: null, supervisorId: null, tipo: 'PONTO' })
  })

}
