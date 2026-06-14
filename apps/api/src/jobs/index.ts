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

  // Worker de ciclo de alerta
  const { cicloAlertaWorker } = await import('./ciclo-alerta.job.js')
  cicloAlertaWorker()

  // Job de sync de assinaturas (a cada 6h)
  const { agendarSyncAssinaturas } = await import('./assinatura-sync.job.js')
  await agendarSyncAssinaturas()

  // Job de verificação de agendas — inicia ciclos automaticamente (a cada 1 min)
  const { agendarVerificacaoCiclos } = await import('./ciclo-agendamento.job.js')
  await agendarVerificacaoCiclos()

  // Worker de notificações (WhatsApp via EvoGo)
  const { notificacaoWorker } = await import('./notificacao.job.js')
  notificacaoWorker()

  console.log('✅ Jobs iniciados')
}
