import { prisma } from '@opencheck/database'
import { cicloAlertaQueue, notificacaoQueue } from '../../infra/redis/queues.js'
import { getIO } from '../../infra/socket/socket.js'
import { getConfigCiclo, getExecucaoAtiva, nowLocal } from './field-api.utils.js'
import { getEzvizClient } from '../../infra/ezviz/ezviz.factory.js'
import { uploadFromUrl } from '../../infra/storage/storage.service.js'
import type { AgentContext } from './field-api.middleware.js'

const TZ = 'America/Sao_Paulo'

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

async function resolveOperadorId(tenantId: string, valor: string | undefined): Promise<string | null> {
  if (!valor) return null
  if (/^\d{4}$/.test(valor)) {
    const op = await prisma.operador.findFirst({ where: { tenantId, codigo: valor, ativo: true } })
    return op?.id ?? null
  }
  return valor
}

function diaSemanaEmSP(): number {
  const spNow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  return spNow.getDay()
}

function hojeEmSP(): Date {
  const spDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return new Date(`${spDate}T00:00:00.000Z`)
}

function calcDeadline(data: Date, hora: string, toleranciaMinutos: number): Date {
  const spDate = data.toISOString().slice(0, 10)
  const [h, m] = hora.split(':').map(Number)
  const ms = Date.parse(`${spDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`)
  return new Date(ms + toleranciaMinutos * 60_000)
}

type OperadorConfig = {
  id: string
  nome: string
  telefone: string | null
  codigo: string | null
}

type TurnoAberturaConfig = {
  id: string
  diasSemana: number[]
  horaAbertura: string
  toleranciaMinutos: number
  horaFechamento: string | null
  toleranciaFechamentoMinutos: number
  checkinFechamentoObrigatorio: boolean
  ativo: boolean
}

type ConfigAberturaField = {
  ativo: boolean
  emailAlerta: string | null
  codigoCheckInPrazo: string
  codigoCheckInAtrasado: string
  codigoAusente: string
  atualizadoEm: Date
  turnos: TurnoAberturaConfig[]
}

function findTurnoHoje(turnos: TurnoAberturaConfig[]) {
  const diaSemana = diaSemanaEmSP()
  return turnos.find(t => t.diasSemana.length === 0 || t.diasSemana.includes(diaSemana)) ?? null
}

function mapOperadores(operadores: OperadorConfig[]) {
  return operadores.map(operador => ({
    id: operador.id,
    codigo: operador.codigo ?? null,
    nome: operador.nome,
    telefone: operador.telefone,
  }))
}

function buildAberturaConfig(config: ConfigAberturaField | null) {
  if (!config) return null

  const turnoHoje = findTurnoHoje(config.turnos)

  return {
    ativo: config.ativo,
    emailAlerta: config.emailAlerta,
    endpointCheckin: '/api/field/v1/abertura/checkin',
    codigosEvento: {
      checkinNoPrazo: config.codigoCheckInPrazo,
      checkinAtrasado: config.codigoCheckInAtrasado,
      ausente: config.codigoAusente,
    },
    turnos: config.turnos.map(turno => ({
      id: turno.id,
      diasSemana: turno.diasSemana,
      horaAbertura: turno.horaAbertura,
      toleranciaMinutos: turno.toleranciaMinutos,
      ativo: turno.ativo,
    })),
    turnoHoje: turnoHoje ? {
      id: turnoHoje.id,
      diasSemana: turnoHoje.diasSemana,
      horaAbertura: turnoHoje.horaAbertura,
      toleranciaMinutos: turnoHoje.toleranciaMinutos,
      ativo: turnoHoje.ativo,
    } : null,
    versaoConfig: config.atualizadoEm.toISOString(),
  }
}

function buildFechamentoConfig(config: ConfigAberturaField | null) {
  if (!config) return null

  const turnoHoje = findTurnoHoje(config.turnos)
  const turnosComFechamento = config.turnos.filter(turno => !!turno.horaFechamento)

  return {
    ativo: config.ativo && turnosComFechamento.length > 0,
    endpointCheckin: '/api/field/v1/abertura/fechamento',
    turnos: turnosComFechamento.map(turno => ({
      id: turno.id,
      diasSemana: turno.diasSemana,
      horaFechamento: turno.horaFechamento,
      toleranciaMinutos: turno.toleranciaFechamentoMinutos,
      checkinObrigatorio: turno.checkinFechamentoObrigatorio,
      ativo: turno.ativo,
    })),
    turnoHoje: turnoHoje?.horaFechamento ? {
      id: turnoHoje.id,
      diasSemana: turnoHoje.diasSemana,
      horaFechamento: turnoHoje.horaFechamento,
      toleranciaMinutos: turnoHoje.toleranciaFechamentoMinutos,
      checkinObrigatorio: turnoHoje.checkinFechamentoObrigatorio,
      ativo: turnoHoje.ativo,
    } : null,
    versaoConfig: config.atualizadoEm.toISOString(),
  }
}

function buildStatusLojaHoje(
  config: ConfigAberturaField | null,
  registro: {
    status: string
    abertaEm: Date | null
    deadlineEm: Date
    statusFechamento: string | null
    fechamentoEm: Date | null
  } | null,
) {
  if (!config) return null

  const turnoHoje = findTurnoHoje(config.turnos)
  if (!turnoHoje) return null

  const hoje = hojeEmSP()
  const deadlineAbertura = calcDeadline(hoje, turnoHoje.horaAbertura, turnoHoje.toleranciaMinutos)
  const deadlineFechamento = turnoHoje.horaFechamento
    ? calcDeadline(hoje, turnoHoje.horaFechamento, turnoHoje.toleranciaFechamentoMinutos)
    : null

  return {
    abertura: {
      status: registro?.status ?? 'PENDENTE',
      abertaEm: registro?.abertaEm?.toISOString() ?? null,
      deadlineEm: (registro?.deadlineEm ?? deadlineAbertura).toISOString(),
    },
    fechamento: {
      habilitado: !!turnoHoje.horaFechamento,
      checkinObrigatorio: turnoHoje.checkinFechamentoObrigatorio,
      status: registro?.statusFechamento ?? null,
      fechamentoEm: registro?.fechamentoEm?.toISOString() ?? null,
      deadlineEm: deadlineFechamento?.toISOString() ?? null,
    },
  }
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
  const [ponto, configAbertura, registroHoje] = await Promise.all([
    prisma.ponto.findUnique({
      where: { id: ctx.pontoId },
      include: {
        operadores:  { where: { ativo: true }, select: { id: true, nome: true, telefone: true, codigo: true } },
        supervisores: { where: { ativo: true }, select: { id: true, nome: true, codigo: true } },
        cameras:    { where: { ativa: true }, select: { id: true, deviceSerial: true, deviceName: true, channelNo: true } },
        tenant:     { select: { id: true, nome: true } },
      },
    }),
    prisma.configAbertura.findUnique({
      where: { pontoId: ctx.pontoId },
      include: {
        turnos: {
          where: { ativo: true },
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            diasSemana: true,
            horaAbertura: true,
            toleranciaMinutos: true,
            horaFechamento: true,
            toleranciaFechamentoMinutos: true,
            checkinFechamentoObrigatorio: true,
            ativo: true,
          },
        },
      },
    }),
    prisma.registroAbertura.findUnique({
      where: { pontoId_data: { pontoId: ctx.pontoId, data: hojeEmSP() } },
      select: {
        status: true,
        abertaEm: true,
        deadlineEm: true,
        statusFechamento: true,
        fechamentoEm: true,
      },
    }),
  ])

  if (!ponto) throw new Error('Ponto não encontrado')

  const operador = ctx.operadorId
    ? ponto.operadores.find(v => v.id === ctx.operadorId) ?? ponto.operadores[0] ?? null
    : ponto.operadores[0] ?? null

  const operadores = mapOperadores(ponto.operadores)
  return {
    agentKeyPonto: ponto.agentKey,
    modoOperacao: 'ABERTURA_FECHAMENTO',
    operadorAtual: operador ? {
      id: operador.id,
      codigo: operador.codigo ?? null,
      nome: operador.nome,
      telefone: operador.telefone,
    } : null,
    ponto: {
      id:        ponto.id,
      nome:      ponto.nome,
      descricao: ponto.descricao,
      endereco:  ponto.endereco,
      ativo:     ponto.ativo,
    },
    operadores,
    supervisores: ponto.supervisores,
    abertura: buildAberturaConfig(configAbertura),
    fechamento: buildFechamentoConfig(configAbertura),
    statusLojaHoje: buildStatusLojaHoje(configAbertura, registroHoje),
    cameras: ponto.cameras,
    canalAlerta: ponto.canalAlerta ?? 'WHATSAPP',
    empresa: { id: ponto.tenant.id, nome: ponto.tenant.nome },
    serverTime: nowLocal(),
  }
}

// ── GET /config/ciclo ──────────────────────────────────────────────────────────

export async function getConfigCicloLeve(ctx: AgentContext) {
  const [configAbertura, operador, registroHoje] = await Promise.all([
    prisma.configAbertura.findUnique({
      where: { pontoId: ctx.pontoId },
      include: {
        turnos: {
          where: { ativo: true },
          orderBy: { criadoEm: 'asc' },
          select: {
            id: true,
            diasSemana: true,
            horaAbertura: true,
            toleranciaMinutos: true,
            horaFechamento: true,
            toleranciaFechamentoMinutos: true,
            checkinFechamentoObrigatorio: true,
            ativo: true,
          },
        },
      },
    }),
    ctx.operadorId
      ? prisma.operador.findUnique({ where: { id: ctx.operadorId }, select: { id: true, codigo: true } })
      : null,
    prisma.registroAbertura.findUnique({
      where: { pontoId_data: { pontoId: ctx.pontoId, data: hojeEmSP() } },
      select: {
        status: true,
        abertaEm: true,
        deadlineEm: true,
        statusFechamento: true,
        fechamentoEm: true,
      },
    }),
  ])

  return {
    modoOperacao:       'ABERTURA_FECHAMENTO',
    pontoId:           ctx.pontoId,
    operadorAtual:     operador ? { id: operador.id, codigo: operador.codigo ?? null } : null,
    abertura:          buildAberturaConfig(configAbertura),
    fechamento:        buildFechamentoConfig(configAbertura),
    statusLojaHoje:    buildStatusLojaHoje(configAbertura, registroHoje),
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

export async function registrarCheckin(ctx: AgentContext, body: { operadorId?: string; observacao?: string }) {
  const execucao = await getExecucaoAtiva(ctx.pontoId)

  if (!execucao) {
    return { aceito: false, erro: 'CICLO_INATIVO', mensagem: 'Não há ciclo ativo para este ponto' }
  }

  const operadorId = await resolveOperadorId(ctx.tenantId, body.operadorId) ?? ctx.operadorId

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
      meta:     { operadorId, observacao: body.observacao, codigoEvento: CODIGOS_EVENTO.CHECKIN },
    },
  })

  void captureSnapshot(ctx.tenantId, ctx.pontoId, eventoCheckin.id)

  // Realtime update
  try {
    getIO().to(`tenant:${ctx.tenantId}`).emit('checkin:recebido', {
      pontoId: ctx.pontoId, operadorId, timestamp: nowLocal(),
    })
  } catch {}

  await notificacaoQueue.add('checkin', { tenantId: ctx.tenantId, pontoId: ctx.pontoId, eventoId: eventoCheckin.id, tipo: 'CHECKIN', operadorId, codigoEvento: CODIGOS_EVENTO.CHECKIN })

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
  operadorId?: string
}) {
  const tipo = body.tipo ?? 'PANICO_SILENCIOSO'
  const codigoEvento = CODIGOS_EVENTO[tipo] ?? CODIGOS_EVENTO.PANICO
  const operadorId = await resolveOperadorId(ctx.tenantId, body.operadorId) ?? ctx.operadorId

  const evento = await prisma.evento.create({
    data: {
      tenantId: ctx.tenantId,
      pontoId:  ctx.pontoId,
      tipo:     tipo as never,
      meta: {
        operadorId,
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

export async function registrarFalha(ctx: AgentContext, body: { observacao?: string; operadorId?: string }) {
  const operadorId = await resolveOperadorId(ctx.tenantId, body.operadorId) ?? ctx.operadorId
  const evento = await prisma.evento.create({
    data: {
      tenantId: ctx.tenantId,
      pontoId:  ctx.pontoId,
      tipo:     'FALHA',
      meta: {
        operadorId,
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

// ─── Supervisor ───────────────────────────────────────────────────────────────

export async function registrarEntradaSupervisor(ctx: AgentContext) {
  const { tenantId, pontoId, supervisorId } = ctx
  if (!supervisorId) throw new Error('supervisorId ausente no contexto')

  const registro = await prisma.registroSupervisor.create({
    data: { supervisorId, pontoId, tenantId, tipo: 'ENTRADA', ip: null, userAgent: null },
  })

  await prisma.evento.create({
    data: {
      tenantId,
      pontoId,
      tipo: 'SUPERVISOR_ENTRADA',
      meta: { supervisorId, registroId: registro.id },
    },
  })

  return registro
}

export async function registrarSaidaSupervisor(ctx: AgentContext) {
  const { tenantId, pontoId, supervisorId } = ctx
  if (!supervisorId) throw new Error('supervisorId ausente no contexto')

  const registro = await prisma.registroSupervisor.create({
    data: { supervisorId, pontoId, tenantId, tipo: 'SAIDA', ip: null, userAgent: null },
  })

  await prisma.evento.create({
    data: {
      tenantId,
      pontoId,
      tipo: 'SUPERVISOR_SAIDA',
      meta: { supervisorId, registroId: registro.id },
    },
  })

  return registro
}
