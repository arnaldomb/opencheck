import { Worker } from 'bullmq'
import { prisma } from '@opencheck/database'
import { redisConnection } from '../infra/redis/redis.client.js'
import { aberturaQueue, notificacaoQueue } from '../infra/redis/queues.js'
import { reagendarDeadlinesHoje } from '../modules/abertura/abertura.service.js'

const TZ = 'America/Sao_Paulo'

export function aberturaDeadlineWorker(): void {
  new Worker('abertura-deadline', async (job) => {

    if (job.name === 'deadline') {
      const { pontoId, tenantId, turnoId, data } = job.data as {
        pontoId: string; tenantId: string; turnoId: string; data: string
      }
      const dataDate = new Date(data)

      const registro = await prisma.registroAbertura.findUnique({
        where: { pontoId_data: { pontoId, data: dataDate } },
      })

      const turno = await prisma.turnoAbertura.findUnique({ where: { id: turnoId } })
      if (!turno) return

      const config = await prisma.configAbertura.findUnique({
        where: { id: turno.configId },
        include: { ponto: { select: { nome: true, tenant: { select: { nome: true } } } } },
      })
      if (!config) return

      const [h, m] = turno.horaAbertura.split(':').map(Number)
      const spDate = dataDate.toISOString().slice(0, 10)
      const deadlineMs = Date.parse(`${spDate}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00-03:00`)
        + turno.toleranciaMinutos * 60_000
      const deadline = new Date(deadlineMs)
      const abertaNoPrazo = !!registro?.abertaEm && registro.abertaEm.getTime() <= deadlineMs

      if (abertaNoPrazo) return

      const registroFinal = registro
        ? await prisma.registroAbertura.update({
            where: { id: registro.id },
            data: registro.abertaEm
              ? { jobId: null, deadlineEm: deadline }
              : { status: 'AUSENTE', jobId: null, deadlineEm: deadline },
          })
        : await prisma.registroAbertura.create({
            data: {
              tenantId, pontoId, configId: config.id, turnoId,
              data: dataDate, status: 'AUSENTE', deadlineEm: deadline,
            },
          })

      // Criar evento visível no relatório
      const evento = await prisma.evento.create({
        data: {
          tenantId,
          pontoId,
          tipo: 'ABERTURA_AUSENTE',
          meta: {
            registroAberturaId: registroFinal.id,
            horaAbertura: turno.horaAbertura,
            toleranciaMinutos: turno.toleranciaMinutos,
          },
        },
      })

      await notificacaoQueue.add('abertura-ausente', {
        tenantId, pontoId, eventoId: evento.id,
        tipo: 'ABERTURA_AUSENTE',
      })
    }

    if (job.name === 'agendar-dia') {
      await reagendarDeadlinesHoje()
    }

  }, { connection: redisConnection })
}

export async function agendarDeadlinesDiarios(): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10)

  await aberturaQueue.add(
    'agendar-dia',
    {},
    { jobId: `agendar-dia-${hoje}`, removeOnComplete: true, removeOnFail: false },
  )

  await aberturaQueue.add(
    'agendar-dia',
    {},
    { repeat: { pattern: '0 3 * * *' }, removeOnComplete: true },
  )
}
