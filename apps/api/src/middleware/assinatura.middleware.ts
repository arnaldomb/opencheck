import { prisma } from '@opencheck/database'
import { FastifyRequest, FastifyReply } from 'fastify'

export class SemAssinaturaError extends Error { constructor(msg = 'Nenhuma assinatura encontrada') { super(msg); this.name = 'SemAssinaturaError' } }
export class AssinaturaCanceladaError extends Error { constructor() { super('Assinatura cancelada'); this.name = 'AssinaturaCanceladaError' } }
export class TrialExpiradoError extends Error { constructor() { super('Período de trial expirado. Aguardando pagamento.'); this.name = 'TrialExpiradoError' } }
export class LimitePontosError extends Error { constructor(msg: string) { super(msg); this.name = 'LimitePontosError' } }

export async function verificarAssinatura(tenantId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { tenantId } })

  if (!assinatura) throw new SemAssinaturaError()
  if (assinatura.status === 'CANCELADA') throw new AssinaturaCanceladaError()

  if (assinatura.status === 'TRIAL' && assinatura.trialAteEm && assinatura.trialAteEm < new Date()) {
    throw new TrialExpiradoError()
  }
  // INADIMPLENTE: acesso de leitura mantido — verificado por rota específica
}

export async function verificarLimitePontos(tenantId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUnique({ where: { tenantId } })
  if (!assinatura || assinatura.status === 'CANCELADA') throw new SemAssinaturaError()

  const pontosAtivos = await prisma.ponto.count({ where: { tenantId, ativo: true } })

  if (pontosAtivos >= assinatura.pontosContratados) {
    throw new LimitePontosError(
      `Limite de ${assinatura.pontosContratados} pontos atingido. Solicite upgrade do plano.`,
    )
  }
}

export async function assinaturaMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const tenantId = (request.user as { tenantId?: string })?.tenantId
    if (!tenantId) return
    await verificarAssinatura(tenantId)
  } catch (err) {
    if (err instanceof SemAssinaturaError || err instanceof AssinaturaCanceladaError) {
      return reply.status(402).send({ error: err.message })
    }
    if (err instanceof TrialExpiradoError) {
      return reply.status(402).send({ error: err.message })
    }
    throw err
  }
}
