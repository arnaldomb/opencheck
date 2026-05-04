import { prisma } from '@alerta-vigia/database'
import { cicloAlertaQueue, notificacaoQueue } from '../../infra/redis/queues.js'
import { getIO } from '../../infra/socket/socket.js'
import { getConfigCiclo, getExecucaoAtiva, nowLocal } from './field-api.utils.js'
import { getEzvizClient } from '../../infra/ezviz/ezviz.factory.js'
import { uploadFromUrl } from '../../infra/storage/storage.service.js'
import type { AgentContext } from './field-api.middleware.js'

async function captureSnapshot(tenantId: string, pontoId: string, eventoId: string, attempt = 1): Promise<void> {
  try {
    // Brief initial delay: reduces EZVIZ timeouts when multiple events fire in quick succession
    if (attempt === 1) await new Promise(r => setTimeout(r, 4_000))

    const cameras = await prisma.camera.findMany({ where: { pontoId, ativa: true }, take: 1 })
    if (!cameras[0]) { console.warn('[snapshot] Nenhuma câmera ativa para pontoId', pontoId); return }
    const client     = getEzvizClient()
    const { picUrl } = await client.captureSnapshot(cameras[0].deviceSerial, cameras[0].channelNo)
    const key        = `${tenantId}/${cameras[0].id}/${Date.now()}.jpg`
    const imageUrl   = await uploadFromUrl(picUrl, key)
    await prisma.snapshot.create({ data: { cameraId: cameras[0].id, imageUrl, eventoId } })
    console.info('[snapshot] Capturado e salvo:', imageUrl)
  } catch (err) {
    if (attempt < 4) {
      const delay = attempt * 10_000
      console.warn(`[snapshot] Tentativa ${attempt} falhou, retrying em ${delay / 1000}s...`)
      await new Promise(r => setTimeout(r, delay))
      return captureSnapshot(tenantId, pontoId, eventoId, attempt + 1)
    }
    console.error('[snapshot] Falha definitiva após 4 tentativas:', err)
  }
}

async function resolveVigilanteId(tenantId: string, valor: string | undefined): Promise<string | null> {
  if (!valor) return null
  if (/^\d{4}$/.test(valor)) {
    const vig = await prisma.vigilante.findFirst({ where: { tenantId, codigo: valor, ativo: true } })
    return vig?.id ?? null
  }
  return valor
}

const CODIGOS_EVENTO: Record<string, string> = {
  CHECKIN:           '1602',
  PANICO:            '1120',
  COACAO:            '1121',
  PANICO_SILENCIOSO: '1122',
  FALHA:             '1130',
}

// ── GET /config ────────────────────────────────────────────────────────────────

export async function getConfig(ctx: AgentContext) {
  const [ponto, execucao] = await Promise.all([
    prisma.ponto.findUnique({
      where: { id: ctx.pontoId },
      include: {
        vigilantes: { where: { ativo: true }, select: { id: true, nome: true, telefone: true, codigo: true } },
        cameras:    { where: { ativa: true }, select: { id: true, deviceSerial: true, deviceName: true, channelNo: true } },
        tenant:     { select: { id: true, nome: true } },
      },
    }),
    getExecucaoAtiva(ctx.pontoId),
  ])

  if (!ponto) throw new Error('Ponto não encontrado')

  const cicloConfig = await getConfigCiclo(ctx.pontoId, ctx.tenantId)

  const vigilante = ctx.vigilanteId
    ? ponto.vigilantes.find(v => v.id === ctx.vigilanteId) ?? ponto.vigilantes[0] ?? null
    : ponto.vigilantes[0] ?? null

  const vigilanteId = vigilante?.codigo ?? vigilante?.id ?? null

  return {
    agentKeyPonto: ponto.agentKey,
    vigilanteId,
    ponto: {
      id:        ponto.id,
      nome:      ponto.nome,
      descricao: ponto.descricao,
      endereco:  ponto.endereco,
      ativo:     ponto.ativo,
    },
    vigilantes: ponto.vigilantes.map(v => ({
      id:       v.codigo ?? v.id,
      nome:     v.nome,
      telefone: v.telefone,
    })),
    ciclo: cicloConfig ? {
      duracaoMinutos:    cicloConfig.duracaoMinutos,
      toleranciaMinutos: cicloConfig.toleranciaMinutos,
      avisoAntesMinutos: cicloConfig.avisoAntesMin,
      codigoCheckin:     cicloConfig.codigoCheckin,
      codigoPanico:      cicloConfig.codigoPanico,
      codigoFalha:       cicloConfig.codigoFalha,
      capturarSnapshot:  cicloConfig.capturarSnapshot,
      autoReiniciar:     cicloConfig.autoReiniciar,
      heranca:           cicloConfig.pontoId ? 'proprio' : 'empresa',
      versaoConfig:      cicloConfig.atualizadoEm.toISOString(),
    } : null,
    agendas: cicloConfig?.agendas ?? [],
    cameras:    ponto.cameras,
    canalAlerta: ponto.canalAlerta ?? 'WHATSAPP',
    empresa:    { id: ponto.tenant.id, nome: ponto.tenant.nome },
    execucaoAtual: execucao ? buildExecucaoStatus(execucao, cicloConfig) : null,
    serverTime: nowLocal(),
  }
}

// ── GET /config/ciclo ──────────────────────────────────────────────────────────

export async function getConfigCicloLeve(ctx: AgentContext) {
  const cicloConfig = await getConfigCiclo(ctx.pontoId, ctx.tenantId)
  const execucao = await getExecucaoAtiva(ctx.pontoId)

  return {
    pontoId:           ctx.pontoId,
    vigilanteId:       ctx.vigilanteId ?? null,
    duracaoMinutos:    cicloConfig?.duracaoMinutos ?? 10,
    toleranciaMinutos: cicloConfig?.toleranciaMinutos ?? 2,
    avisoAntesMinutos: cicloConfig?.avisoAntesMin ?? 5,
    autoReiniciar:     cicloConfig?.autoReiniciar ?? true,
    heranca:           cicloConfig?.pontoId ? 'proprio' : 'empresa',
    versaoConfig:      cicloConfig?.atualizadoEm.toISOString() ?? null,
    agendas:           cicloConfig?.agendas ?? [],
    expiraEm:          execucao?.expiraEm?.toISOString() ?? null,
    serverTime:        nowLocal(),
  }
}

// ── GET /status ────────────────────────────────────────────────────────────────

export async function getStatus(ctx: AgentContext) {
  const [execucao, cicloConfig] = await Promise.all([
    getExecucaoAtiva(ctx.pontoId),
    getConfigCiclo(ctx.pontoId, ctx.tenantId),
  ])

  if (!execucao) {
    return { pontoId: ctx.pontoId, execucaoId: null, status: 'INATIVO', faseAtual: 'INATIVO', serverTime: nowLocal() }
  }

  return buildExecucaoStatus(execucao, cicloConfig)
}

function buildExecucaoStatus(
  execucao: { id: string; status: string; iniciadoEm: Date; expiraEm: Date; alertaEm: Date | null },
  config: { avisoAntesMin: number } | null,
) {
  const agora = new Date()
  const segundosRestantes = Math.max(0, Math.floor((execucao.expiraEm.getTime() - agora.getTime()) / 1000))
  const limiteAviso = (config?.avisoAntesMin ?? 5) * 60

  const faseAtual =
    execucao.status === 'ALERTA' ? 'ALERTA' :
    segundosRestantes <= limiteAviso ? 'AVISO' : 'NORMAL'

  return {
    execucaoId:        execucao.id,
    status:            execucao.status,
    iniciadoEm:        execucao.iniciadoEm.toISOString(),
    expiraEm:          execucao.expiraEm.toISOString(),
    alertaEm:          execucao.alertaEm?.toISOString() ?? null,
    segundosRestantes,
    faseAtual,
    serverTime:        nowLocal(),
  }
}

// ── POST /checkin ──────────────────────────────────────────────────────────────

export async function registrarCheckin(ctx: AgentContext, body: { vigilanteId?: string; observacao?: string }) {
  const execucao = await getExecucaoAtiva(ctx.pontoId)

  if (!execucao) {
    return { aceito: false, erro: 'CICLO_INATIVO', mensagem: 'Não há ciclo ativo para este ponto' }
  }

  const vigilanteId = await resolveVigilanteId(ctx.tenantId, body.vigilanteId) ?? ctx.vigilanteId

  // Cancel pending BullMQ jobs
  if (execucao.avisoJobId)  await cicloAlertaQueue.remove(execucao.avisoJobId).catch(() => {})
  if (execucao.expiraJobId) await cicloAlertaQueue.remove(execucao.expiraJobId).catch(() => {})

  await prisma.execucaoCiclo.update({
    where: { id: execucao.id },
    data: { status: 'CONCLUIDO', checkinEm: new Date(), finalizadoEm: new Date() },
  })

  const eventoCheckin = await prisma.evento.create({
    data: {
      tenantId: ctx.tenantId,
      pontoId:  ctx.pontoId,
      tipo:     'CHECKIN',
      meta:     { vigilanteId, observacao: body.observacao, codigoEvento: CODIGOS_EVENTO.CHECKIN },
    },
  })

  void captureSnapshot(ctx.tenantId, ctx.pontoId, eventoCheckin.id)

  // Realtime update
  try {
    getIO().to(`tenant:${ctx.tenantId}`).emit('checkin:recebido', {
      pontoId: ctx.pontoId, vigilanteId, timestamp: nowLocal(),
    })
  } catch {}

  await notificacaoQueue.add('checkin', { tenantId: ctx.tenantId, pontoId: ctx.pontoId, eventoId: eventoCheckin.id, tipo: 'CHECKIN', vigilanteId, codigoEvento: CODIGOS_EVENTO.CHECKIN })

  const cicloConfig = await getConfigCiclo(ctx.pontoId, ctx.tenantId)
  let proximoCiclo = null

  if (cicloConfig?.autoReiniciar) {
    proximoCiclo = await iniciarCiclo(ctx.pontoId, ctx.tenantId, cicloConfig)
  }

  return {
    aceito: true,
    execucaoId: execucao.id,
    proximoCiclo: proximoCiclo ? {
      iniciadoEm:        proximoCiclo.iniciadoEm.toISOString(),
      expiraEm:          proximoCiclo.expiraEm.toISOString(),
      duracaoMinutos:    cicloConfig!.duracaoMinutos,
      toleranciaMinutos: cicloConfig!.toleranciaMinutos,
    } : null,
    serverTime: nowLocal(),
  }
}

// ── POST /panico ───────────────────────────────────────────────────────────────

export async function dispararPanico(ctx: AgentContext, body: {
  tipo?: 'PANICO' | 'PANICO_SILENCIOSO' | 'COACAO'
  observacao?: string
  vigilanteId?: string
}) {
  const tipo = body.tipo ?? 'PANICO_SILENCIOSO'
  const codigoEvento = CODIGOS_EVENTO[tipo] ?? CODIGOS_EVENTO.PANICO
  const vigilanteId = await resolveVigilanteId(ctx.tenantId, body.vigilanteId) ?? ctx.vigilanteId

  const evento = await prisma.evento.create({
    data: {
      tenantId: ctx.tenantId,
      pontoId:  ctx.pontoId,
      tipo:     tipo as never,
      meta: {
        vigilanteId,
        codigoEvento,
        observacao: body.observacao,
      },
    },
  })

  // Capture snapshot asynchronously — do not await so panic fires immediately
  void captureSnapshot(ctx.tenantId, ctx.pontoId, evento.id)

  const ponto = await prisma.ponto.findUnique({ where: { id: ctx.pontoId }, select: { nome: true, canalAlerta: true } })
  const canal = ponto?.canalAlerta ?? 'WHATSAPP'

  await notificacaoQueue.add('panico', {
    tenantId: ctx.tenantId, pontoId: ctx.pontoId, eventoId: evento.id,
    tipo, codigoEvento, canal,
    mensagem: `🚨 *${tipo.replace('_', ' ')}* — ${ponto?.nome ?? 'Ponto'}\nVigilante acionou alerta. Verifique imediatamente!`,
  }, { priority: 1 })

  try {
    getIO().to(`tenant:${ctx.tenantId}`).emit('panico:disparado', {
      pontoId: ctx.pontoId, tipo, codigoEvento, timestamp: nowLocal(),
    })
  } catch {}

  return {
    aceito:        true,
    eventoId:      evento.id,
    tipo,
    codigoEvento,
    canalDisparado: canal,
    serverTime:    nowLocal(),
  }
}

// ── POST /falha ────────────────────────────────────────────────────────────────

export async function registrarFalha(ctx: AgentContext, body: { observacao?: string; vigilanteId?: string }) {
  const vigilanteId = await resolveVigilanteId(ctx.tenantId, body.vigilanteId) ?? ctx.vigilanteId
  const evento = await prisma.evento.create({
    data: {
      tenantId: ctx.tenantId,
      pontoId:  ctx.pontoId,
      tipo:     'FALHA',
      meta: {
        vigilanteId,
        codigoEvento: CODIGOS_EVENTO.FALHA,
        observacao: body.observacao,
      },
    },
  })

  void captureSnapshot(ctx.tenantId, ctx.pontoId, evento.id)

  await notificacaoQueue.add('falha', {
    tenantId: ctx.tenantId, pontoId: ctx.pontoId, eventoId: evento.id,
    tipo: 'FALHA', codigoEvento: CODIGOS_EVENTO.FALHA,
  }, { priority: 2 })

  try {
    getIO().to(`tenant:${ctx.tenantId}`).emit('falha:registrada', {
      pontoId: ctx.pontoId, timestamp: nowLocal(),
    })
  } catch {}

  return { aceito: true, eventoId: evento.id, codigoEvento: CODIGOS_EVENTO.FALHA, serverTime: nowLocal() }
}

// ── POST /ciclo/iniciar ────────────────────────────────────────────────────────

export async function iniciarCicloManual(ctx: AgentContext) {
  const ativa = await getExecucaoAtiva(ctx.pontoId)
  if (ativa) {
    return { iniciado: false, erro: 'CICLO_JA_ATIVO', mensagem: 'Já existe um ciclo em andamento para este ponto' }
  }

  const config = await getConfigCiclo(ctx.pontoId, ctx.tenantId)
  if (!config) {
    return { iniciado: false, erro: 'SEM_CONFIG', mensagem: 'Nenhuma configuração de ciclo encontrada para este ponto' }
  }

  const execucao = await iniciarCiclo(ctx.pontoId, ctx.tenantId, config)

  return {
    iniciado:          true,
    execucaoId:        execucao.id,
    expiraEm:          execucao.expiraEm.toISOString(),
    duracaoMinutos:    config.duracaoMinutos,
    toleranciaMinutos: config.toleranciaMinutos,
    serverTime:        nowLocal(),
  }
}

// ── POST /ciclo/parar ──────────────────────────────────────────────────────────

export async function pararCiclo(ctx: AgentContext) {
  const execucao = await getExecucaoAtiva(ctx.pontoId)
  if (!execucao) {
    return { parado: false, erro: 'CICLO_INATIVO', mensagem: 'Não há ciclo ativo para este ponto' }
  }

  if (execucao.avisoJobId)  await cicloAlertaQueue.remove(execucao.avisoJobId).catch(() => {})
  if (execucao.expiraJobId) await cicloAlertaQueue.remove(execucao.expiraJobId).catch(() => {})

  await prisma.execucaoCiclo.update({
    where: { id: execucao.id },
    data: { status: 'CANCELADO', finalizadoEm: new Date() },
  })

  try {
    getIO().to(`tenant:${ctx.tenantId}`).emit('ciclo:parado', {
      pontoId: ctx.pontoId, execucaoId: execucao.id, timestamp: nowLocal(),
    })
  } catch {}

  return { parado: true, execucaoId: execucao.id, serverTime: nowLocal() }
}

// ── Internal helper ────────────────────────────────────────────────────────────

async function iniciarCiclo(
  pontoId: string, tenantId: string,
  config: { id: string; duracaoMinutos: number; toleranciaMinutos: number; avisoAntesMin: number },
) {
  const agora = new Date()
  const expiraEm = new Date(agora.getTime() + config.duracaoMinutos * 60 * 1000)

  const execucao = await prisma.execucaoCiclo.create({
    data: { configId: config.id, pontoId, iniciadoEm: agora, expiraEm },
  })

  // Schedule aviso e expiração via BullMQ
  const avisoMs  = Math.max(0, (config.duracaoMinutos - config.avisoAntesMin) * 60 * 1000)
  const expiraMs = config.duracaoMinutos * 60 * 1000

  const [avisoJob, expiraJob] = await Promise.all([
    cicloAlertaQueue.add('aviso', { execucaoId: execucao.id, pontoId, tenantId }, { delay: avisoMs }),
    cicloAlertaQueue.add('expirar', { execucaoId: execucao.id, pontoId, tenantId }, { delay: expiraMs }),
  ])

  await prisma.execucaoCiclo.update({
    where: { id: execucao.id },
    data: { avisoJobId: avisoJob.id, expiraJobId: expiraJob.id },
  })

  try {
    getIO().to(`tenant:${tenantId}`).emit('ciclo:iniciado', {
      pontoId, execucaoId: execucao.id, expiraEm: expiraEm.toISOString(),
    })
  } catch {}

  return execucao
}
