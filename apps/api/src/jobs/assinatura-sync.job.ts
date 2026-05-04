import { Queue, Worker } from 'bullmq'
import { prisma } from '@alerta-vigia/database'
import { asaasClient } from '../infra/asaas/asaas.client.js'
import { redisConnection } from '../infra/redis/redis.client.js'

const syncQueue = new Queue('assinatura-sync', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
})

async function syncAssinaturas(): Promise<void> {
  const assinaturas = await prisma.assinatura.findMany({
    where: { status: { in: ['ATIVA', 'TRIAL', 'INADIMPLENTE'] } },
  })

  for (const assinatura of assinaturas) {
    if (!assinatura.asaasSubscriptionId) continue
    try {
      const sub = await asaasClient.getSubscription(assinatura.asaasSubscriptionId)

      if (sub.deleted) {
        await prisma.assinatura.update({ where: { id: assinatura.id }, data: { status: 'CANCELADA' } })
      } else if (sub.status === 'INACTIVE' && assinatura.status === 'ATIVA') {
        await prisma.assinatura.update({ where: { id: assinatura.id }, data: { status: 'SUSPENSA' } })
      }
    } catch {
      // Ignorar erros individuais — log já feito pelo worker
    }
  }
}

export async function agendarSyncAssinaturas(): Promise<void> {
  await syncQueue.add('sync', {}, { repeat: { every: 6 * 60 * 60 * 1000 } })

  new Worker('assinatura-sync', async () => {
    await syncAssinaturas()
  }, { connection: redisConnection })
}
