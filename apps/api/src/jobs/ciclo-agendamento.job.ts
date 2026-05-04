import { Queue, Worker } from 'bullmq'
import { prisma } from '@alerta-vigia/database'
import { redisConnection } from '../infra/redis/redis.client.js'
import { cicloAlertaQueue } from '../infra/redis/queues.js'
import { dentroDeAgenda, getExecucaoAtiva } from '../modules/field-api/field-api.utils.js'
import { getIO } from '../infra/socket/socket.js'

const agendamentoQueue = new Queue('ciclo-agendamento', {
  connection: redisConnection,
  defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
})

async function verificarCiclos(): Promise<void> {
  const configs = await prisma.configCiclo.findMany({
    where: { ativo: true, pontoId: { not: null } },
    include: {
      agendas: { where: { ativo: true } },
      ponto: { select: { id: true, ativo: true, tenantId: true } },
    },
  })

  for (const config of configs) {
    if (!config.ponto?.ativo) continue
    if (config.agendas.length === 0) continue  // sem agenda = campo controla manualmente

    const pontoId  = config.pontoId!
    const tenantId = config.ponto.tenantId
    const dentro   = dentroDeAgenda(config.agendas)
    const ativa    = await getExecucaoAtiva(pontoId)

    if (dentro && !ativa) {
      // Dentro do horário e sem ciclo → iniciar
      try {
        const agora    = new Date()
        const expiraEm = new Date(agora.getTime() + config.duracaoMinutos * 60_000)
        const execucao = await prisma.execucaoCiclo.create({
          data: { configId: config.id, pontoId, iniciadoEm: agora, expiraEm },
        })
        const avisoMs  = Math.max(0, (config.duracaoMinutos - config.avisoAntesMin) * 60_000)
        const expiraMs = config.duracaoMinutos * 60_000
        const [avisoJob, expiraJob] = await Promise.all([
          cicloAlertaQueue.add('aviso',   { execucaoId: execucao.id, pontoId, tenantId }, { delay: avisoMs }),
          cicloAlertaQueue.add('expirar', { execucaoId: execucao.id, pontoId, tenantId }, { delay: expiraMs }),
        ])
        await prisma.execucaoCiclo.update({
          where: { id: execucao.id },
          data: { avisoJobId: avisoJob.id, expiraJobId: expiraJob.id },
        })
        try { getIO().to(`tenant:${tenantId}`).emit('ciclo:iniciado', { pontoId, execucaoId: execucao.id, expiraEm: expiraEm.toISOString(), origem: 'agenda' }) } catch {}
        console.log(`[ciclo-agendamento] Ciclo iniciado: ${pontoId}`)
      } catch (err) {
        console.error(`[ciclo-agendamento] Erro ao iniciar ciclo para ${pontoId}:`, err)
      }
    }

    if (!dentro && ativa) {
      // Fora do horário e com ciclo ativo → parar
      try {
        if (ativa.avisoJobId)  await cicloAlertaQueue.remove(ativa.avisoJobId).catch(() => {})
        if (ativa.expiraJobId) await cicloAlertaQueue.remove(ativa.expiraJobId).catch(() => {})
        await prisma.execucaoCiclo.update({
          where: { id: ativa.id },
          data: { status: 'CANCELADO', finalizadoEm: new Date() },
        })
        try { getIO().to(`tenant:${tenantId}`).emit('ciclo:parado', { pontoId, execucaoId: ativa.id, origem: 'agenda', timestamp: new Date().toISOString() }) } catch {}
        console.log(`[ciclo-agendamento] Ciclo encerrado por agenda: ${pontoId}`)
      } catch (err) {
        console.error(`[ciclo-agendamento] Erro ao parar ciclo para ${pontoId}:`, err)
      }
    }
  }
}

export async function agendarVerificacaoCiclos(): Promise<void> {
  // Roda a cada minuto
  await agendamentoQueue.add('verificar', {}, { repeat: { every: 60_000 } })

  new Worker('ciclo-agendamento', async () => {
    await verificarCiclos()
  }, { connection: redisConnection })

  // Também roda imediatamente na inicialização
  await verificarCiclos()
}
