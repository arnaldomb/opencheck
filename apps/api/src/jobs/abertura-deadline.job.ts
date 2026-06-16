import { Worker } from 'bullmq'
import { prisma } from '@opencheck/database'
import { redisConnection } from '../infra/redis/redis.client.js'
import { aberturaQueue, notificacaoQueue } from '../infra/redis/queues.js'
import { reagendarDeadlinesHoje, reagendarFechamentosHoje } from '../modules/abertura/abertura.service.js'

const TZ = 'America/Sao_Paulo'

export function aberturaDeadlineWorker(): void {
  new Worker('abertura-deadline', async (job) => {

    // ── deadline de abertura ────────────────────────────────────────────────
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

      const codigoEvento = config.codigoAusente

      const evento = await prisma.evento.create({
        data: {
          tenantId, pontoId,
          tipo: 'ABERTURA_AUSENTE',
          meta: {
            registroAberturaId: registroFinal.id,
            horaAbertura: turno.horaAbertura,
            toleranciaMinutos: turno.toleranciaMinutos,
            codigoEvento,
          },
        },
      })

      await notificacaoQueue.add('abertura-ausente', {
        tenantId, pontoId, eventoId: evento.id, tipo: 'ABERTURA_AUSENTE', codigoEvento,
      })
    }

    // ── deadline de fechamento ──────────────────────────────────────────────
    if (job.name === 'fechamento-deadline') {
      const { pontoId, tenantId, turnoId, data, checkinObrigatorio } = job.data as {
        pontoId: string; tenantId: string; turnoId: string; data: string; checkinObrigatorio: boolean
      }
      const dataDate = new Date(data)

      const registro = await prisma.registroAbertura.findUnique({
        where: { pontoId_data: { pontoId, data: dataDate } },
      })

      // Já foi fechado manualmente
      if (registro?.fechamentoEm) return

      const turno = await prisma.turnoAbertura.findUnique({ where: { id: turnoId } })
      if (!turno || !turno.horaFechamento) return

      const config = await prisma.configAbertura.findUnique({
        where: { id: turno.configId },
      })
      if (!config) return

      const spDate = dataDate.toISOString().slice(0, 10)
      const [hf, mf] = turno.horaFechamento.split(':').map(Number)
      const fechamentoMs = Date.parse(
        `${spDate}T${String(hf).padStart(2,'0')}:${String(mf).padStart(2,'0')}:00-03:00`
      ) + turno.toleranciaFechamentoMinutos * 60_000
      const fechamentoDeadline = new Date(fechamentoMs)

      if (checkinObrigatorio) {
        // Fechamento obrigatório não realizado → alerta AUSENTE
        const regFinal = registro
          ? await prisma.registroAbertura.update({
              where: { id: registro.id },
              data: { statusFechamento: 'AUSENTE', fechamentoJobId: null },
            })
          : null

        if (regFinal) {
          const evento = await prisma.evento.create({
            data: {
              tenantId, pontoId,
              tipo: 'FECHAMENTO_AUSENTE',
              meta: {
                registroAberturaId: regFinal.id,
                horaFechamento: turno.horaFechamento,
                toleranciaFechamentoMinutos: turno.toleranciaFechamentoMinutos,
              },
            },
          })

          await notificacaoQueue.add('fechamento-ausente', {
            tenantId, pontoId, eventoId: evento.id, tipo: 'FECHAMENTO_AUSENTE',
          })
        }
      } else {
        // Fechamento não obrigatório → auto-fechar silenciosamente
        const agora = new Date()
        if (registro) {
          await prisma.registroAbertura.update({
            where: { id: registro.id },
            data: {
              fechamentoEm:      fechamentoDeadline,
              statusFechamento:  'AUTO_FECHADO',
              fechamentoJobId:   null,
            },
          })
        }
        // Não cria evento nem notificação — fechamento automático esperado
      }
    }

    // ── agendar deadlines do dia ────────────────────────────────────────────
    if (job.name === 'agendar-dia') {
      await reagendarDeadlinesHoje()
      await reagendarFechamentosHoje()
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
