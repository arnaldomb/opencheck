import type { FastifyInstance } from 'fastify'
import type { AsaasWebhookPayload } from '@opencheck/asaas-sdk'
import { WEBHOOK_HANDLERS } from '../assinaturas/webhook.handler.js'
import { webhookQueue } from '../../infra/redis/queues.js'

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/asaas', async (request, reply) => {
    const token = request.headers['asaas-access-token']
    if (token !== process.env.ASAAS_WEBHOOK_TOKEN) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    // Responder 200 imediatamente — processar de forma assíncrona
    reply.status(200).send({ received: true })

    const payload = request.body as AsaasWebhookPayload
    await webhookQueue.add('asaas-webhook', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    })
  })
}
