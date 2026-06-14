import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@opencheck/database'

export interface AgentContext {
  tenantId: string
  pontoId: string
  operadorId: string | null
  tipo: 'PONTO' | 'OPERADOR'
}

declare module 'fastify' {
  interface FastifyRequest {
    agentCtx: AgentContext
  }
}

export async function agentKeyMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const agentKey = request.headers['x-agent-key'] as string | undefined

  if (!agentKey?.startsWith('av_')) {
    return reply.status(401).send({ erro: 'AGENT_KEY_INVALIDA', mensagem: 'Chave inválida ou ausente' })
  }

  // Try as ponto key
  const ponto = await prisma.ponto.findUnique({
    where: { agentKey },
    include: { tenant: { select: { id: true, ativo: true, assinatura: { select: { status: true } } } } },
  })

  if (ponto) {
    if (!ponto.ativo) {
      return reply.status(401).send({ erro: 'PONTO_INATIVO', mensagem: 'Este ponto está desativado' })
    }
    if (!ponto.tenant.ativo) {
      return reply.status(401).send({ erro: 'TENANT_INATIVO', mensagem: 'Conta da empresa inativa' })
    }
    const statusAss = ponto.tenant.assinatura?.status
    if (statusAss === 'CANCELADA' || statusAss === 'SUSPENSA') {
      return reply.status(401).send({ erro: 'ASSINATURA_CANCELADA', mensagem: 'Assinatura cancelada. Contate o administrador.' })
    }

    await logAcesso('PONTO', ponto.id, ponto.tenantId, request)
    request.agentCtx = { tenantId: ponto.tenantId, pontoId: ponto.id, operadorId: null, tipo: 'PONTO' }
    return
  }

  // Try as operador key
  const operador = await prisma.operador.findUnique({
    where: { agentKey },
    include: {
      tenant: { select: { id: true, ativo: true, assinatura: { select: { status: true } } } },
      pontos: { select: { id: true }, take: 1 },
    },
  })

  if (operador) {
    if (!operador.ativo) {
      return reply.status(401).send({ erro: 'OPERADOR_INATIVO', mensagem: 'Operador desativado' })
    }
    if (!operador.tenant.ativo) {
      return reply.status(401).send({ erro: 'TENANT_INATIVO', mensagem: 'Conta da empresa inativa' })
    }
    if (!operador.pontos[0]) {
      return reply.status(401).send({ erro: 'SEM_PONTO', mensagem: 'Operador não vinculado a nenhum ponto' })
    }
    const statusAss = operador.tenant.assinatura?.status
    if (statusAss === 'CANCELADA' || statusAss === 'SUSPENSA') {
      return reply.status(401).send({ erro: 'ASSINATURA_CANCELADA', mensagem: 'Assinatura cancelada. Contate o administrador.' })
    }

    await logAcesso('OPERADOR', operador.id, operador.tenantId, request)
    request.agentCtx = {
      tenantId: operador.tenantId,
      pontoId: operador.pontos[0].id,
      operadorId: operador.id,
      tipo: 'OPERADOR',
    }
    return
  }

  return reply.status(401).send({ erro: 'AGENT_KEY_INVALIDA', mensagem: 'Chave não encontrada' })
}

async function logAcesso(tipo: 'PONTO' | 'OPERADOR', referenciaId: string, tenantId: string, request: FastifyRequest) {
  const acao = `${request.method}:${request.url.split('?')[0]}`
  await prisma.agentKeyLog.create({
    data: {
      tipo,
      referenciaId,
      tenantId,
      acao,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    },
  }).catch(() => {}) // log failure must not break the request
}
