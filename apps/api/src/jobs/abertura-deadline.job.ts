import { Worker } from 'bullmq'
import { prisma } from '@opencheck/database'
import { redisConnection } from '../infra/redis/redis.client.js'
import { aberturaQueue } from '../infra/redis/queues.js'

const TZ = 'America/Sao_Paulo'

function hojeEmSP(): Date {
  const spDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return new Date(spDate + 'T00:00:00.000Z')
}

export function aberturaDeadlineWorker(): void {
  new Worker('abertura-deadline', async (job) => {

    if (job.name === 'deadline') {
      const { pontoId, tenantId, data } = job.data as {
        pontoId: string; tenantId: string; data: string
      }
      const dataDate = new Date(data)

      const registro = await prisma.registroAbertura.findUnique({
        where: { pontoId_data: { pontoId, data: dataDate } },
      })

      if (registro?.abertaEm) return // check-in já feito

      const config = await prisma.configAbertura.findUnique({ where: { pontoId } })
      if (!config) return

      const [h, m] = config.horaAbertura.split(':').map(Number)
      const deadline = new Date(dataDate)
      deadline.setUTCHours(h, m, 0, 0)
      deadline.setMinutes(deadline.getMinutes() + config.toleranciaMinutos)

      if (registro) {
        await prisma.registroAbertura.update({
          where: { id: registro.id },
          data: { status: 'AUSENTE', jobId: null },
        })
      } else {
        await prisma.registroAbertura.create({
          data: {
            tenantId, pontoId, configId: config.id,
            data: dataDate, status: 'AUSENTE', deadlineEm: deadline,
          },
        })
      }
    }

    if (job.name === 'agendar-dia') {
      // Roda diariamente: agenda um job de deadline por ponto com config ativa
      const configs = await prisma.configAbertura.findMany({
        where: { ativo: true },
        include: { ponto: { select: { tenantId: true } } },
      })

      const hoje = hojeEmSP()
      const hojeDiaSemana = new Date().getDay()

      for (const config of configs) {
        if (config.diasSemana.length > 0 && !config.diasSemana.includes(hojeDiaSemana)) continue

        const [h, m] = config.horaAbertura.split(':').map(Number)
        const deadline = new Date(hoje)
        deadline.setUTCHours(h, m, 0, 0)
        const deadlineMs = deadline.getTime() + config.toleranciaMinutos * 60_000
        const delay = deadlineMs - Date.now()

        if (delay <= 0) continue

        const j = await aberturaQueue.add(
          'deadline',
          { pontoId: config.pontoId, tenantId: config.ponto.tenantId, data: hoje.toISOString() },
          { delay, removeOnComplete: true, removeOnFail: false },
        )

        // Persistir jobId para poder cancelar no check-in
        const existing = await prisma.registroAbertura.findUnique({
          where: { pontoId_data: { pontoId: config.pontoId, data: hoje } },
        })
        if (existing) {
          await prisma.registroAbertura.update({ where: { id: existing.id }, data: { jobId: j.id } })
        }
      }
    }

  }, { connection: redisConnection })
}

export async function agendarDeadlinesDiarios(): Promise<void> {
  // Roda todo dia às 00:00 BRT (03:00 UTC)
  await aberturaQueue.add(
    'agendar-dia',
    {},
    { repeat: { pattern: '0 3 * * *' }, removeOnComplete: true },
  )
}
