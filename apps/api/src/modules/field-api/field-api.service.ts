import { prisma } from '@opencheck/database'
import { cicloAlertaQueue, notificacaoQueue } from '../../infra/redis/queues.js'
import { getIO } from '../../infra/socket/socket.js'
import { getConfigCiclo, getExecucaoAtiva, nowLocal } from './field-api.utils.js'
import type { AgentContext } from './field-api.middleware.js'

const TZ = 'America/Sao_Paulo'

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

interface RegistroSupervisorOpts {
  pontoId?: string
  ip?: string
  userAgent?: string
}

async function registrarMovimentoSupervisor(
  ctx: AgentContext,
  tipo: 'ENTRADA' | 'SAIDA',
  opts: RegistroSupervisorOpts,
) {
  const { tenantId, supervisorId } = ctx
  if (!supervisorId) throw new Error('supervisorId ausente no contexto')
  const pontoId = opts.pontoId ?? ctx.pontoId

  // Sequência ENTRADA→SAIDA: evita entrada duplicada no dia e saída órfã.
  // Entrada em aberto de dia anterior não bloqueia (é fechada junto com a loja).
  const ultimo = await prisma.registroSupervisor.findFirst({
    where: { tenantId, supervisorId, pontoId },
    orderBy: { registradoEm: 'desc' },
    select: { tipo: true, registradoEm: true },
  })
  const mesmoDiaSP = (d: Date) =>
    d.toLocaleDateString('en-CA', { timeZone: TZ }) === new Date().toLocaleDateString('en-CA', { timeZone: TZ })

  if (tipo === 'ENTRADA') {
    if (ultimo?.tipo === 'ENTRADA' && mesmoDiaSP(ultimo.registradoEm)) {
      const hora = ultimo.registradoEm.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
      throw Object.assign(
        new Error(`Entrada já registrada às ${hora} — faça o check-out antes de uma nova entrada`),
        { status: 409, erro: 'VISITA_JA_ABERTA' },
      )
    }
  } else {
    if (!ultimo || ultimo.tipo !== 'ENTRADA') {
      throw Object.assign(
        new Error('Nenhuma entrada em aberto — registre o check-in de chegada primeiro'),
        { status: 409, erro: 'SEM_VISITA_ABERTA' },
      )
    }
  }

  const registro = await prisma.registroSupervisor.create({
    data: {
      supervisorId, pontoId, tenantId, tipo,
      ip:        opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
    },
    include: { supervisor: { select: { id: true, nome: true } } },
  })

  const tipoEvento = tipo === 'ENTRADA' ? 'SUPERVISOR_ENTRADA' as const : 'SUPERVISOR_SAIDA' as const

  const cfgGlobal = await prisma.configEventoGlobal.findUnique({ where: { id: 'global' } })
  const codigoEvento = ((cfgGlobal?.codigos as Record<string, string> | null) ?? {})[tipoEvento]
    ?? (tipo === 'ENTRADA' ? '1420' : '1421')

  const evento = await prisma.evento.create({
    data: {
      tenantId,
      pontoId,
      tipo: tipoEvento,
      meta: { supervisorId, registroId: registro.id, codigoEvento },
    },
  })

  // Notificação WhatsApp com mensagem personalizada de chegada/saída
  await notificacaoQueue.add('supervisor-visita', {
    tenantId, pontoId, eventoId: evento.id, tipo: tipoEvento, codigoEvento,
  })

  return registro
}

export async function registrarEntradaSupervisor(ctx: AgentContext, opts: RegistroSupervisorOpts = {}) {
  return registrarMovimentoSupervisor(ctx, 'ENTRADA', opts)
}

export async function registrarSaidaSupervisor(ctx: AgentContext, opts: RegistroSupervisorOpts = {}) {
  return registrarMovimentoSupervisor(ctx, 'SAIDA', opts)
}
