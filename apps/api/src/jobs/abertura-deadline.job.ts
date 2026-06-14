import { Worker } from 'bullmq'
import { prisma } from '@opencheck/database'
import { redisConnection } from '../infra/redis/redis.client.js'
import { aberturaQueue } from '../infra/redis/queues.js'

const TZ = 'America/Sao_Paulo'

function hojeEmSP(): Date {
  const spDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return new Date(spDate + 'T00:00:00.000Z')
}

function diaSemanaEmSP(): number {
  const spNow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  return spNow.getDay()
}

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

      if (registro?.abertaEm) return // check-in já feito

      const turno = await prisma.turnoAbertura.findUnique({ where: { id: turnoId } })
      if (!turno) return

      const config = await prisma.configAbertura.findUnique({ where: { id: turno.configId } })
      if (!config) return

      const [h, m] = turno.horaAbertura.split(':').map(Number)
      const spDate = dataDate.toLocaleDateString('en-CA', { timeZone: TZ })
      const deadlineMs = Date.parse(`${spDate}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00-03:00`)
        + turno.toleranciaMinutos * 60_000
      const deadline = new Date(deadlineMs)

      if (registro) {
        await prisma.registroAbertura.update({
          where: { id: registro.id },
          data: { status: 'AUSENTE', jobId: null },
        })
      } else {
        await prisma.registroAbertura.create({
          data: {
            tenantId, pontoId, configId: config.id, turnoId,
            data: dataDate, status: 'AUSENTE', deadlineEm: deadline,
          },
        })
      }
    }

    if (job.name === 'agendar-dia') {
      // Agenda um job de deadline por turno ativo que opere hoje
      const turnos = await prisma.turnoAbertura.findMany({
        where: { ativo: true, config: { ativo: true } },
        include: {
          config: {
            select: { id: true, pontoId: true, ponto: { select: { tenantId: true } } },
          },
        },
      })

      const hoje = hojeEmSP()
      const diaSemana = diaSemanaEmSP()

      for (const turno of turnos) {
        if (turno.diasSemana.length > 0 && !turno.diasSemana.includes(diaSemana)) continue

        const [h, m] = turno.horaAbertura.split(':').map(Number)
        const spDate = hoje.toLocaleDateString('en-CA', { timeZone: TZ })
        const deadlineMs = Date.parse(`${spDate}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00-03:00`)
          + turno.toleranciaMinutos * 60_000
        const delay = deadlineMs - Date.now()

        if (delay <= 0) continue

        const j = await aberturaQueue.add(
          'deadline',
          {
            pontoId: turno.config.pontoId,
            tenantId: turno.config.ponto.tenantId,
            turnoId: turno.id,
            data: hoje.toISOString(),
          },
          { delay, removeOnComplete: true, removeOnFail: false },
        )

        const existing = await prisma.registroAbertura.findUnique({
          where: { pontoId_data: { pontoId: turno.config.pontoId, data: hoje } },
        })
        if (existing) {
          await prisma.registroAbertura.update({ where: { id: existing.id }, data: { jobId: j.id } })
        }
      }
    }

  }, { connection: redisConnection })
}

export async function agendarDeadlinesDiarios(): Promise<void> {
  await aberturaQueue.add(
    'agendar-dia',
    {},
    { repeat: { pattern: '0 3 * * *' }, removeOnComplete: true },
  )
}
