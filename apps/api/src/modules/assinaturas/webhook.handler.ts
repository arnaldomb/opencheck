import { prisma, CobrancaStatus } from '@opencheck/database'
import type { AsaasWebhookPayload, AsaasPayment } from '@opencheck/asaas-sdk'

async function idempotente(eventId: string, fn: () => Promise<void>): Promise<void> {
  const jaProcessado = await prisma.cobranca.findUnique({ where: { asaasEventId: eventId } })
  if (jaProcessado) return
  await fn()
}

async function upsertCobranca(payment: AsaasPayment, status: CobrancaStatus, eventId?: string): Promise<void> {
  if (!payment.subscription) return
  const assinatura = await prisma.assinatura.findUnique({ where: { asaasSubscriptionId: payment.subscription } })
  if (!assinatura) return

  await prisma.cobranca.upsert({
    where: { asaasPaymentId: payment.id },
    update: { status, paguEm: payment.paymentDate ? new Date(payment.paymentDate) : null, asaasEventId: eventId ?? null },
    create: {
      assinaturaId: assinatura.id,
      asaasPaymentId: payment.id,
      asaasEventId: eventId ?? null,
      valor: payment.value,
      billingType: payment.billingType,
      status,
      vencimentoEm: new Date(payment.dueDate),
      paguEm: payment.paymentDate ? new Date(payment.paymentDate) : null,
    },
  })
}

export const WEBHOOK_HANDLERS: Record<string, (payload: AsaasWebhookPayload) => Promise<void>> = {

  PAYMENT_CONFIRMED: async ({ payment, id }) => {
    if (!payment?.subscription) return
    await idempotente(id, async () => {
      await prisma.assinatura.update({
        where: { asaasSubscriptionId: payment.subscription! },
        data: { status: 'ATIVA', proximaCobrancaEm: new Date(payment.dueDate) },
      })
      await upsertCobranca(payment, 'CONFIRMADA', id)
    })
  },

  PAYMENT_RECEIVED: async ({ payment, id }) => {
    if (!payment?.subscription) return
    await idempotente(id, async () => {
      await upsertCobranca(payment, 'RECEBIDA', id)
    })
  },

  PAYMENT_OVERDUE: async ({ payment, id }) => {
    if (!payment?.subscription) return
    await idempotente(id, async () => {
      await prisma.assinatura.update({
        where: { asaasSubscriptionId: payment.subscription! },
        data: { status: 'INADIMPLENTE' },
      })
      await upsertCobranca(payment, 'VENCIDA', id)
    })
  },

  PAYMENT_CANCELED: async ({ payment, id }) => {
    if (!payment?.subscription) return
    await idempotente(id, async () => {
      await upsertCobranca(payment, 'CANCELADA', id)
    })
  },

  SUBSCRIPTION_INACTIVATED: async ({ subscription, id }) => {
    if (!subscription) return
    await idempotente(id, async () => {
      await prisma.assinatura.update({
        where: { asaasSubscriptionId: subscription.id },
        data: { status: 'SUSPENSA' },
      })
    })
  },

  SUBSCRIPTION_DELETED: async ({ subscription, id }) => {
    if (!subscription) return
    await idempotente(id, async () => {
      await prisma.assinatura.update({
        where: { asaasSubscriptionId: subscription.id },
        data: { status: 'CANCELADA', canceladaEm: new Date() },
      })
    })
  },
}
