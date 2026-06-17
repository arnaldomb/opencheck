import { Worker } from 'bullmq'
import { redisConnection } from '../infra/redis/redis.client.js'
import { WEBHOOK_HANDLERS } from '../modules/assinaturas/webhook.handler.js'
import type { AsaasWebhookPayload } from '@opencheck/asaas-sdk'

export async function startJobs(): Promise<void> {
  // Worker de webhooks Asaas
  new Worker('webhook', async (job) => {
    if (job.name === 'asaas-webhook') {
      const payload = job.data as AsaasWebhookPayload
      const handler = WEBHOOK_HANDLERS[payload.event]
      if (handler) await handler(payload)
    }
  }, { connection: redisConnection })

  // Job de sync de assinaturas (a cada 6h)
  const { agendarSyncAssinaturas } = await import('./assinatura-sync.job.js')
  await agendarSyncAssinaturas()

  // Worker de notificações (WhatsApp via EvoGo)
  const { notificacaoWorker } = await import('./notificacao.job.js')
  notificacaoWorker()

  // Worker de deadline de abertura + agendamento diário
  const { aberturaDeadlineWorker, agendarDeadlinesDiarios } = await import('./abertura-deadline.job.js')
  aberturaDeadlineWorker()
  await agendarDeadlinesDiarios()

  console.log('✅ Jobs iniciados')
}
