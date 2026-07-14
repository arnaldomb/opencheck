import { prisma, Assinatura, Plano } from '@opencheck/database'
import { addDays, format } from 'date-fns'
import { asaasClient } from '../../infra/asaas/asaas.client.js'
import type { BillingType } from '@opencheck/asaas-sdk'

interface CriarAssinaturaOpcoes {
  periodicidade: 'MENSAL' | 'ANUAL'
  billingType: BillingType
  nextDueDate: string
  trialDias?: number
  valorManual?: number
}

// Encontra a faixa de preço ativa cuja [faixaMin, faixaMax] cobre a
// quantidade contratada. faixaMax nulo = sem limite superior ("Sob Cotação").
export function resolverFaixaPorQuantidade(planos: Plano[], quantidade: number): Plano | undefined {
  return planos
    .filter(p => p.ativo && quantidade >= p.faixaMin && (p.faixaMax == null || quantidade <= p.faixaMax))
    .sort((a, b) => a.faixaMin - b.faixaMin)[0]
}

// valor mensal = quantidade × preço por conta da faixa; faixas "Sob Cotação"
// (precoConta nulo) exigem valor manual informado pelo superadmin.
export function calcularValorMensal(plano: Plano, quantidade: number, valorManual?: number | null): number {
  if (plano.precoConta != null) return quantidade * Number(plano.precoConta)
  if (valorManual != null) return valorManual
  throw new Error(`A faixa "${plano.nome}" é sob cotação — informe o valor mensal manualmente`)
}

export async function criarAssinatura(
  tenantId: string,
  planoId: string,
  quantidade: number,
  opcoes: CriarAssinaturaOpcoes,
): Promise<Assinatura> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })
  const plano = await prisma.plano.findUniqueOrThrow({ where: { id: planoId } })

  let customerId = (await prisma.assinatura.findUnique({ where: { tenantId } }))?.asaasCustomerId

  if (!customerId) {
    const customer = await asaasClient.createCustomer({
      name: tenant.nome,
      email: tenant.email,
      cpfCnpj: tenant.cnpj ?? undefined,
      phone: tenant.telefone ?? undefined,
    })
    customerId = customer.id
  }

  const primeiraCobranca = opcoes.trialDias
    ? format(addDays(new Date(), opcoes.trialDias), 'yyyy-MM-dd')
    : opcoes.nextDueDate

  const valorMensal = calcularValorMensal(plano, quantidade, opcoes.valorManual)
  const valor = opcoes.periodicidade === 'ANUAL' ? valorMensal * 12 : valorMensal
  const cycle = opcoes.periodicidade === 'ANUAL' ? 'YEARLY' : 'MONTHLY'

  const subscription = await asaasClient.createSubscription({
    customer: customerId,
    billingType: opcoes.billingType,
    nextDueDate: primeiraCobranca,
    value: valor,
    cycle,
    description: `OpenCheck — ${plano.nome} (${quantidade} contas, ${cycle === 'YEARLY' ? 'Anual' : 'Mensal'})`,
    externalReference: tenantId,
  })

  return prisma.assinatura.upsert({
    where: { tenantId },
    update: {
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription.id,
      planoId,
      periodicidade: opcoes.periodicidade,
      status: opcoes.trialDias ? 'TRIAL' : 'ATIVA',
      pontosContratados: quantidade,
      trialAteEm: opcoes.trialDias ? addDays(new Date(), opcoes.trialDias) : null,
      proximaCobrancaEm: new Date(subscription.nextDueDate),
    },
    create: {
      tenantId,
      planoId,
      periodicidade: opcoes.periodicidade,
      status: opcoes.trialDias ? 'TRIAL' : 'ATIVA',
      asaasCustomerId: customerId,
      asaasSubscriptionId: subscription.id,
      pontosContratados: quantidade,
      trialAteEm: opcoes.trialDias ? addDays(new Date(), opcoes.trialDias) : null,
      proximaCobrancaEm: new Date(subscription.nextDueDate),
    },
  })
}

interface DefinirQuantidadeOpcoes {
  valorManual?: number
  billingType?: BillingType
  nextDueDate?: string
  periodicidade?: 'MENSAL' | 'ANUAL'
  trialDias?: number
}

// Ajusta a quantidade de contas contratadas de um cliente — resolve a faixa
// de preço correspondente, recalcula o valor mensal e sincroniza com o Asaas
// (atualiza a assinatura existente ou cria uma nova, se ainda não houver).
export async function definirQuantidadeContratada(
  tenantId: string,
  quantidade: number,
  opcoes: DefinirQuantidadeOpcoes = {},
): Promise<Assinatura> {
  if (quantidade < 1) throw new Error('Quantidade contratada deve ser maior que zero')

  const planos = await prisma.plano.findMany({ where: { ativo: true } })
  const plano = resolverFaixaPorQuantidade(planos, quantidade)
  if (!plano) throw new Error('Nenhuma faixa de preço cadastrada cobre essa quantidade de contas')

  const valorMensal = calcularValorMensal(plano, quantidade, opcoes.valorManual)
  const existente = await prisma.assinatura.findUnique({ where: { tenantId } })

  if (existente?.asaasSubscriptionId) {
    const valor = existente.periodicidade === 'ANUAL' ? valorMensal * 12 : valorMensal
    await asaasClient.updateSubscription(existente.asaasSubscriptionId, {
      value: valor,
      description: `OpenCheck — ${plano.nome} (${quantidade} contas)`,
      updatePendingPayments: true,
    })
    return prisma.assinatura.update({
      where: { tenantId },
      data: { planoId: plano.id, pontosContratados: quantidade },
    })
  }

  return criarAssinatura(tenantId, plano.id, quantidade, {
    periodicidade: opcoes.periodicidade ?? 'MENSAL',
    billingType: opcoes.billingType ?? 'PIX',
    nextDueDate: opcoes.nextDueDate ?? format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    trialDias: opcoes.trialDias,
    valorManual: opcoes.valorManual,
  })
}

export async function cancelarAssinatura(tenantId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUniqueOrThrow({ where: { tenantId } })
  await asaasClient.cancelSubscription(assinatura.asaasSubscriptionId!)
  // O webhook SUBSCRIPTION_DELETED atualizará o status — processamento assíncrono
}
