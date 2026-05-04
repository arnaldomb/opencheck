import { Worker } from 'bullmq'
import { prisma } from '@alerta-vigia/database'
import { redisConnection } from '../infra/redis/redis.client.js'
import { cicloAlertaQueue } from '../infra/redis/queues.js'
import { getEzvizClient } from '../infra/ezviz/ezviz.factory.js'
import { uploadFromUrl } from '../infra/storage/storage.service.js'

export function cicloAlertaWorker(): void {
  new Worker('ciclo-alerta', async (job) => {
    if (job.name === 'expirar') {
      const { execucaoId, tenantId, pontoId } = job.data as { execucaoId: string; tenantId: string; pontoId: string }

      const execucao = await prisma.execucaoCiclo.findUnique({ where: { id: execucaoId } })
      if (!execucao || execucao.status !== 'EM_ANDAMENTO') return

      // Create evento first so snapshot can reference it
      const evento = await prisma.evento.create({ data: { tenantId, pontoId, tipo: 'FALHA' } })

      // Capturar snapshot
      try {
        const cameras = await prisma.camera.findMany({ where: { pontoId, ativa: true }, take: 1 })
        if (cameras[0]) {
          const client     = getEzvizClient()
          const { picUrl } = await client.captureSnapshot(cameras[0].deviceSerial, cameras[0].channelNo)
          const key        = `${tenantId}/${cameras[0].id}/${Date.now()}.jpg`
          const imageUrl   = await uploadFromUrl(picUrl, key)
          await prisma.snapshot.create({ data: { cameraId: cameras[0].id, imageUrl, eventoId: evento.id } })
        }
      } catch {
        // Snapshot falhou — alerta dispara mesmo assim
      }

      await prisma.execucaoCiclo.update({
        where: { id: execucaoId },
        data: { status: 'ALERTA', alertaEm: new Date(), finalizadoEm: new Date() },
      })

      // Disparar notificação
      const { notificacaoQueue } = await import('../infra/redis/queues.js')
      await notificacaoQueue.add('disparar', { tenantId, pontoId, eventoId: evento.id, tipo: 'FALHA' })
    }
  }, { connection: redisConnection })
}

export async function iniciarCiclo(tenantId: string, pontoId: string): Promise<void> {
  const config =
    await prisma.configCiclo.findFirst({ where: { pontoId } }) ??
    await prisma.configCiclo.findFirst({ where: { tenantId, pontoId: null } })

  if (!config) throw new Error('Nenhuma configuração de ciclo encontrada')

  const duracaoMs = (config.duracaoMinutos + config.toleranciaMinutos) * 60_000
  const expiraEm = new Date(Date.now() + duracaoMs)

  const execucao = await prisma.execucaoCiclo.create({
    data: { configId: config.id, pontoId, expiraEm },
  })

  const expiraJob = await cicloAlertaQueue.add(
    'expirar',
    { execucaoId: execucao.id, tenantId, pontoId },
    { delay: duracaoMs },
  )

  await prisma.execucaoCiclo.update({
    where: { id: execucao.id },
    data: { expiraJobId: expiraJob.id },
  })
}
