import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@alerta-vigia/database'

export interface AgentContext {
  tenantId: string
  pontoId: string
  vigilanteId: string | null
  tipo: 'PONTO' | 'VIGILANTE'
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
    request.agentCtx = { tenantId: ponto.tenantId, pontoId: ponto.id, vigilanteId: null, tipo: 'PONTO' }
    return
  }

  // Try as vigilante key
  const vigilante = await prisma.vigilante.findUnique({
    where: { agentKey },
    include: {
      tenant: { select: { id: true, ativo: true, assinatura: { select: { status: true } } } },
      pontos: { select: { id: true }, take: 1 },
    },
  })

  if (vigilante) {
    if (!vigilante.ativo) {
      return reply.status(401).send({ erro: 'VIGILANTE_INATIVO', mensagem: 'Vigilante desativado' })
    }
    if (!vigilante.tenant.ativo) {
      return reply.status(401).send({ erro: 'TENANT_INATIVO', mensagem: 'Conta da empresa inativa' })
    }
    if (!vigilante.pontos[0]) {
      return reply.status(401).send({ erro: 'SEM_PONTO', mensagem: 'Vigilante não vinculado a nenhum ponto' })
    }
    const statusAss = vigilante.tenant.assinatura?.status
    if (statusAss === 'CANCELADA' || statusAss === 'SUSPENSA') {
      return reply.status(401).send({ erro: 'ASSINATURA_CANCELADA', mensagem: 'Assinatura cancelada. Contate o administrador.' })
    }

    await logAcesso('VIGILANTE', vigilante.id, vigilante.tenantId, request)
    request.agentCtx = {
      tenantId: vigilante.tenantId,
      pontoId: vigilante.pontos[0].id,
      vigilanteId: vigilante.id,
      tipo: 'VIGILANTE',
    }
    return
  }

  return reply.status(401).send({ erro: 'AGENT_KEY_INVALIDA', mensagem: 'Chave não encontrada' })
}

async function logAcesso(tipo: 'PONTO' | 'VIGILANTE', referenciaId: string, tenantId: string, request: FastifyRequest) {
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
