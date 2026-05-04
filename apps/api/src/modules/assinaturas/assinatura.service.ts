import { prisma, Assinatura } from '@alerta-vigia/database'
import { addDays, format } from 'date-fns'
import { asaasClient } from '../../infra/asaas/asaas.client.js'
import type { BillingType } from '@alerta-vigia/asaas-sdk'

interface CriarAssinaturaOpcoes {
  periodicidade: 'MENSAL' | 'ANUAL'
  billingType: BillingType
  nextDueDate: string
  trialDias?: number
}

export async function criarAssinatura(
  tenantId: string,
  planoId: string,
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

  const valor = opcoes.periodicidade === 'ANUAL'
    ? Number(plano.valorAnual ?? Number(plano.valorMensal) * 12)
    : Number(plano.valorMensal)

  const cycle = opcoes.periodicidade === 'ANUAL' ? 'YEARLY' : 'MONTHLY'

  const subscription = await asaasClient.createSubscription({
    customer: customerId,
    billingType: opcoes.billingType,
    nextDueDate: primeiraCobranca,
    value: valor,
    cycle,
    description: `Alerta Vigia — Plano ${plano.nome} (${cycle === 'YEARLY' ? 'Anual' : 'Mensal'})`,
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
      pontosContratados: plano.pontosIncluidos,
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
      pontosContratados: plano.pontosIncluidos,
      trialAteEm: opcoes.trialDias ? addDays(new Date(), opcoes.trialDias) : null,
      proximaCobrancaEm: new Date(subscription.nextDueDate),
    },
  })
}

export async function upgradePlano(tenantId: string, novoPlanoId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUniqueOrThrow({ where: { tenantId } })
  const novoPlano = await prisma.plano.findUniqueOrThrow({ where: { id: novoPlanoId } })

  await asaasClient.updateSubscription(assinatura.asaasSubscriptionId!, {
    value: Number(novoPlano.valorMensal),
    description: `Alerta Vigia — Plano ${novoPlano.nome}`,
    updatePendingPayments: true,
  })

  await prisma.assinatura.update({
    where: { tenantId },
    data: {
      planoId: novoPlanoId,
      pontosContratados: novoPlano.pontosIncluidos,
    },
  })
}

export async function cancelarAssinatura(tenantId: string): Promise<void> {
  const assinatura = await prisma.assinatura.findUniqueOrThrow({ where: { tenantId } })
  await asaasClient.cancelSubscription(assinatura.asaasSubscriptionId!)
  // O webhook SUBSCRIPTION_DELETED atualizará o status — processamento assíncrono
}
