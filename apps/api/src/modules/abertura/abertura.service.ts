import { prisma } from '@opencheck/database'
import { aberturaQueue } from '../../infra/redis/queues.js'
import { notificacaoQueue } from '../../infra/redis/queues.js'

const TZ = 'America/Sao_Paulo'

function hojeEmSP(): Date {
  const spDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return new Date(spDate + 'T00:00:00.000Z')
}

function diaSemanaEmSP(): number {
  const spNow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  return spNow.getDay()
}

function agoraEmSP(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
}

function calcDeadline(data: Date, horaAbertura: string, toleranciaMinutos: number): Date {
  const spDate = data.toISOString().slice(0, 10)
  const [h, m] = horaAbertura.split(':').map(Number)
  const ms = Date.parse(`${spDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`)
  return new Date(ms + toleranciaMinutos * 60_000)
}

function calcFechamentoDeadline(data: Date, horaFechamento: string, toleranciaMinutos: number): Date {
  const spDate = data.toISOString().slice(0, 10)
  const [h, m] = horaFechamento.split(':').map(Number)
  const ms = Date.parse(`${spDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`)
  return new Date(ms + toleranciaMinutos * 60_000)
}

function jobIdAbertura(pontoId: string, data: Date): string {
  return `abertura-${pontoId}-${data.toISOString().slice(0, 10)}`
}

function jobIdFechamento(pontoId: string, data: Date): string {
  return `fechamento-${pontoId}-${data.toISOString().slice(0, 10)}`
}

function turnoDoDia<T extends { diasSemana: number[] }>(turnos: T[], diaSemana: number): T | null {
  return turnos.find(t => t.diasSemana.length === 0 || t.diasSemana.includes(diaSemana)) ?? null
}

async function removerJobSeExistir(jobId?: string | null): Promise<void> {
  if (!jobId) return
  const job = await aberturaQueue.getJob(jobId)
  if (job) await job.remove().catch(() => {})
}

// ─── Abertura deadline ────────────────────────────────────────────────────────

export async function reagendarDeadlineHojeDoPonto(tenantId: string, pontoId: string): Promise<void> {
  const hoje = hojeEmSP()
  const diaSemana = diaSemanaEmSP()

  const existente = await prisma.registroAbertura.findUnique({
    where: { pontoId_data: { pontoId, data: hoje } },
  })

  const jobId = jobIdAbertura(pontoId, hoje)
  await removerJobSeExistir(jobId)
  await removerJobSeExistir(existente?.jobId)

  if (existente?.abertaEm) {
    if (existente.jobId) {
      await prisma.registroAbertura.update({ where: { id: existente.id }, data: { jobId: null } })
    }
    return
  }

  if (existente && !existente.abertaEm && !existente.jobId) return

  const config = await prisma.configAbertura.findFirst({
    where: { tenantId, pontoId, ativo: true },
    include: {
      turnos: { where: { ativo: true }, orderBy: { criadoEm: 'asc' } },
    },
  })

  const turno = config ? turnoDoDia(config.turnos, diaSemana) : null

  if (!config || !turno) {
    if (existente?.jobId) {
      await prisma.registroAbertura.update({ where: { id: existente.id }, data: { jobId: null } })
    }
    return
  }

  const deadline = calcDeadline(hoje, turno.horaAbertura, turno.toleranciaMinutos)
  const delay = Math.max(deadline.getTime() - Date.now(), 0)

  const job = await aberturaQueue.add(
    'deadline',
    { pontoId, tenantId, turnoId: turno.id, data: hoje.toISOString() },
    { jobId, delay, removeOnComplete: true, removeOnFail: false },
  )

  if (existente) {
    await prisma.registroAbertura.update({
      where: { id: existente.id },
      data: { jobId: job.id, deadlineEm: deadline, turnoId: turno.id },
    })
  }
}

export async function reagendarDeadlinesHoje(): Promise<void> {
  const configs = await prisma.configAbertura.findMany({
    where: { ativo: true },
    select: { pontoId: true, tenantId: true },
  })
  for (const config of configs) {
    await reagendarDeadlineHojeDoPonto(config.tenantId, config.pontoId)
  }
}

// ─── Fechamento deadline ──────────────────────────────────────────────────────

export async function reagendarFechamentoHojeDoPonto(tenantId: string, pontoId: string): Promise<void> {
  const hoje = hojeEmSP()
  const diaSemana = diaSemanaEmSP()

  const existente = await prisma.registroAbertura.findUnique({
    where: { pontoId_data: { pontoId, data: hoje } },
  })

  const jobId = jobIdFechamento(pontoId, hoje)
  await removerJobSeExistir(jobId)
  await removerJobSeExistir(existente?.fechamentoJobId)

  // Já fechou — não reagenda
  if (existente?.fechamentoEm) {
    if (existente.fechamentoJobId) {
      await prisma.registroAbertura.update({ where: { id: existente.id }, data: { fechamentoJobId: null } })
    }
    return
  }

  const config = await prisma.configAbertura.findFirst({
    where: { tenantId, pontoId, ativo: true },
    include: { turnos: { where: { ativo: true }, orderBy: { criadoEm: 'asc' } } },
  })

  const turno = config ? turnoDoDia(config.turnos, diaSemana) : null

  if (!config || !turno || !turno.horaFechamento) return

  const deadline = calcFechamentoDeadline(hoje, turno.horaFechamento, turno.toleranciaFechamentoMinutos)
  const delay = Math.max(deadline.getTime() - Date.now(), 0)

  const job = await aberturaQueue.add(
    'fechamento-deadline',
    {
      pontoId, tenantId, turnoId: turno.id,
      data: hoje.toISOString(),
      checkinObrigatorio: turno.checkinFechamentoObrigatorio,
    },
    { jobId, delay, removeOnComplete: true, removeOnFail: false },
  )

  if (existente) {
    await prisma.registroAbertura.update({
      where: { id: existente.id },
      data: { fechamentoJobId: job.id },
    })
  }
}

export async function reagendarFechamentosHoje(): Promise<void> {
  const configs = await prisma.configAbertura.findMany({
    where: { ativo: true },
    include: { turnos: { where: { ativo: true } } },
  })
  for (const config of configs) {
    const diaSemana = diaSemanaEmSP()
    const turno = turnoDoDia(config.turnos, diaSemana)
    if (turno?.horaFechamento) {
      await reagendarFechamentoHojeDoPonto(config.tenantId, config.pontoId)
    }
  }
}

// ─── Check-in de abertura ─────────────────────────────────────────────────────

export async function registrarCheckin(
  tenantId: string,
  pontoId: string,
  opts: { operadorId?: string; supervisorId?: string; nomeComputador?: string; usuarioWindows?: string },
) {
  const config = await prisma.configAbertura.findUnique({
    where: { pontoId },
    include: { turnos: { where: { ativo: true } } },
  })
  if (!config || !config.ativo)
    throw Object.assign(new Error('Ponto sem configuração de abertura ativa'), { status: 400 })

  const ponto = await prisma.ponto.findFirst({ where: { id: pontoId, tenantId } })
  if (!ponto) throw Object.assign(new Error('Ponto não encontrado'), { status: 404 })

  const diaSemana = diaSemanaEmSP()
  const turno = config.turnos.find(
    t => t.diasSemana.length === 0 || t.diasSemana.includes(diaSemana),
  )
  if (!turno)
    throw Object.assign(new Error('Sem turno de abertura configurado para hoje'), { status: 400 })

  const hoje = hojeEmSP()
  const deadline = calcDeadline(hoje, turno.horaAbertura, turno.toleranciaMinutos)
  const agora = new Date()
  const status = agora <= deadline ? ('NO_PRAZO' as const) : ('ATRASADO' as const)

  const existing = await prisma.registroAbertura.findUnique({
    where: { pontoId_data: { pontoId, data: hoje } },
  })

  if (existing?.abertaEm) {
    const deadlineAlterado = existing.deadlineEm.getTime() !== deadline.getTime()
    if (!deadlineAlterado)
      throw Object.assign(new Error('Abertura já registrada para hoje'), { status: 409 })
  }

  const data = {
    abertaEm: agora,
    status,
    turnoId:        turno.id,
    operadorId:     opts.operadorId   ?? null,
    supervisorId:   opts.supervisorId ?? null,
    nomeComputador: opts.nomeComputador ?? null,
    usuarioWindows: opts.usuarioWindows ?? null,
  }

  const registro = existing
    ? await prisma.registroAbertura.update({
        where: { id: existing.id },
        data: { ...data, deadlineEm: deadline },
      })
    : await prisma.registroAbertura.create({
        data: {
          tenantId, pontoId, configId: config.id,
          data: hoje, deadlineEm: deadline,
          ...data,
        },
      })

  const jobId = registro.jobId ?? existing?.jobId
  if (jobId) {
    const job = await aberturaQueue.getJob(jobId)
    if (job) await job.remove().catch(() => {})
    await prisma.registroAbertura.update({ where: { id: registro.id }, data: { jobId: null } })
  }

  const codigoEvento = status === 'NO_PRAZO'
    ? config.codigoCheckInPrazo
    : config.codigoCheckInAtrasado

  const evento = await prisma.evento.create({
    data: {
      tenantId, pontoId,
      tipo: 'ABERTURA_CHECKIN',
      meta: {
        registroAberturaId: registro.id,
        statusAbertura: status,
        codigoEvento,
        operadorId:     opts.operadorId   ?? null,
        supervisorId:   opts.supervisorId ?? null,
        nomeComputador: opts.nomeComputador ?? null,
        usuarioWindows: opts.usuarioWindows ?? null,
      },
    },
  })

  await notificacaoQueue.add('abertura-checkin', {
    tenantId, pontoId, eventoId: evento.id, tipo: 'ABERTURA_CHECKIN', codigoEvento,
  })

  // Agenda job de fechamento se turno tiver horaFechamento
  if (turno.horaFechamento) {
    await reagendarFechamentoHojeDoPonto(tenantId, pontoId)
  }

  return registro
}

// ─── Check-in de fechamento ───────────────────────────────────────────────────

export async function registrarFechamento(
  tenantId: string,
  pontoId: string,
  opts: { operadorId?: string; supervisorId?: string; nomeComputador?: string; usuarioWindows?: string },
) {
  const config = await prisma.configAbertura.findUnique({
    where: { pontoId },
    include: { turnos: { where: { ativo: true } } },
  })
  if (!config || !config.ativo)
    throw Object.assign(new Error('Ponto sem configuração de abertura ativa'), { status: 400 })

  const ponto = await prisma.ponto.findFirst({ where: { id: pontoId, tenantId } })
  if (!ponto) throw Object.assign(new Error('Ponto não encontrado'), { status: 404 })

  const diaSemana = diaSemanaEmSP()
  const turno = config.turnos.find(
    t => t.diasSemana.length === 0 || t.diasSemana.includes(diaSemana),
  )
  if (!turno)
    throw Object.assign(new Error('Sem turno configurado para hoje'), { status: 400 })
  if (!turno.horaFechamento)
    throw Object.assign(new Error('Este turno não tem horário de fechamento configurado'), { status: 400 })

  const hoje = hojeEmSP()
  const existing = await prisma.registroAbertura.findUnique({
    where: { pontoId_data: { pontoId, data: hoje } },
  })

  if (!existing?.abertaEm)
    throw Object.assign(new Error('Não há registro de abertura para este ponto hoje'), { status: 409 })
  if (existing.fechamentoEm)
    throw Object.assign(new Error('Fechamento já registrado para hoje'), { status: 409 })

  const deadline = calcFechamentoDeadline(hoje, turno.horaFechamento, turno.toleranciaFechamentoMinutos)
  const agora = new Date()
  const statusFechamento = agora <= deadline ? ('NO_PRAZO' as const) : ('ATRASADO' as const)

  // Cancela job de fechamento
  const fechJobId = existing.fechamentoJobId ?? jobIdFechamento(pontoId, hoje)
  await removerJobSeExistir(fechJobId)

  const registro = await prisma.registroAbertura.update({
    where: { id: existing.id },
    data: {
      fechamentoEm:           agora,
      statusFechamento,
      fechamentoOperadorId:   opts.operadorId   ?? null,
      fechamentoSupervisorId: opts.supervisorId ?? null,
      fechamentoJobId:        null,
    },
  })

  const evento = await prisma.evento.create({
    data: {
      tenantId, pontoId,
      tipo: 'FECHAMENTO_CHECKIN',
      meta: {
        registroAberturaId: registro.id,
        statusFechamento,
        operadorId:     opts.operadorId   ?? null,
        supervisorId:   opts.supervisorId ?? null,
        nomeComputador: opts.nomeComputador ?? null,
        usuarioWindows: opts.usuarioWindows ?? null,
      },
    },
  })

  await notificacaoQueue.add('fechamento-checkin', {
    tenantId, pontoId, eventoId: evento.id, tipo: 'FECHAMENTO_CHECKIN',
  })

  return registro
}

// ─── Status do dia ────────────────────────────────────────────────────────────

export async function getStatus(tenantId: string) {
  const hoje = hojeEmSP()
  const diaSemana = diaSemanaEmSP()
  const agora = agoraEmSP()

  const [pontos, registros] = await Promise.all([
    prisma.ponto.findMany({
      where: { tenantId, ativo: true },
      select: {
        id: true, nome: true,
        configAbertura: { include: { turnos: { where: { ativo: true } } } },
      },
    }),
    prisma.registroAbertura.findMany({ where: { tenantId, data: hoje } }),
  ])

  const regMap = new Map(registros.map(r => [r.pontoId, r]))

  return pontos.map(p => {
    const reg = regMap.get(p.id)
    const cfg = p.configAbertura
    const turno = cfg?.turnos.find(
      t => t.diasSemana.length === 0 || t.diasSemana.includes(diaSemana),
    ) ?? null

    const deadlineAbertura = turno
      ? calcDeadline(hoje, turno.horaAbertura, turno.toleranciaMinutos)
      : null
    const deadlineFechamento = turno?.horaFechamento
      ? calcFechamentoDeadline(hoje, turno.horaFechamento, turno.toleranciaFechamentoMinutos)
      : null

    return {
      pontoId:    p.id,
      nome:       p.nome,
      configurado: !!cfg && !!turno,
      horaAbertura:    turno?.horaAbertura   ?? null,
      horaFechamento:  turno?.horaFechamento ?? null,
      toleranciaMinutos: turno?.toleranciaMinutos ?? null,
      toleranciaFechamentoMinutos: turno?.toleranciaFechamentoMinutos ?? null,
      checkinFechamentoObrigatorio: turno?.checkinFechamentoObrigatorio ?? false,
      status:       reg?.status ?? (turno ? 'PENDENTE' : 'SEM_CONFIGURACAO'),
      abertaEm:     reg?.abertaEm     ?? null,
      deadlineEm:   deadlineAbertura,
      statusFechamento:  reg?.statusFechamento ?? null,
      fechamentoEm:      reg?.fechamentoEm    ?? null,
      deadlineFechamentoEm: deadlineFechamento,
    }
  })
}

// ─── Sinótico ─────────────────────────────────────────────────────────────────

type StatusSinotico =
  | 'ABERTA'
  | 'FECHADA'
  | 'PENDENTE'
  | 'AUSENTE'
  | 'FECHAMENTO_PENDENTE'
  | 'FOLGA'              // tem turnos configurados, mas nenhum para hoje
  | 'SEM_CONFIGURACAO'

function computeStatusSinotico(opts: {
  turno: { horaAbertura: string; toleranciaMinutos: number; horaFechamento?: string | null; toleranciaFechamentoMinutos: number; checkinFechamentoObrigatorio: boolean } | null
  reg: { abertaEm: Date | null; status: string; fechamentoEm: Date | null; statusFechamento: string | null } | null
  hoje: Date
  agora: Date
}): StatusSinotico {
  const { turno, reg, hoje, agora } = opts

  if (!turno) return 'SEM_CONFIGURACAO'

  // Já fechada (check-in ou auto)
  if (reg?.fechamentoEm || reg?.statusFechamento) return 'FECHADA'

  if (reg?.abertaEm) {
    // Aberta — verificar se está pendente de fechamento
    if (turno.horaFechamento) {
      const dlFech = calcFechamentoDeadline(hoje, turno.horaFechamento, turno.toleranciaFechamentoMinutos)
      if (agora > dlFech) {
        return turno.checkinFechamentoObrigatorio ? 'FECHAMENTO_PENDENTE' : 'FECHADA'
      }
    }
    return 'ABERTA'
  }

  // Sem abertura
  if (reg?.status === 'AUSENTE') return 'AUSENTE'
  const dlAbert = calcDeadline(hoje, turno.horaAbertura, turno.toleranciaMinutos)
  if (agora > dlAbert) return 'AUSENTE'
  return 'PENDENTE'
}

export async function getSinotico(tenantId: string) {
  const hoje = hojeEmSP()
  const diaSemana = diaSemanaEmSP()
  const agora = agoraEmSP()

  const [pontos, registros] = await Promise.all([
    prisma.ponto.findMany({
      where: { tenantId, ativo: true },
      select: {
        id: true, nome: true, endereco: true, latitude: true, longitude: true,
        configAbertura: {
          include: {
            turnos: { where: { ativo: true } },
          },
        },
      },
    }),
    prisma.registroAbertura.findMany({
      where: { tenantId, data: hoje },
      include: {
        operador:              { select: { nome: true } },
        fechamentoOperador:    { select: { nome: true } },
        supervisor:            { select: { nome: true } },
        fechamentoSupervisor:  { select: { nome: true } },
      },
    }),
  ])

  const regMap = new Map(registros.map(r => [r.pontoId, r]))

  return pontos.map(p => {
    const reg   = regMap.get(p.id) ?? null
    const cfg   = p.configAbertura
    const turnoHoje = cfg?.turnos.find(
      t => t.diasSemana.length === 0 || t.diasSemana.includes(diaSemana),
    ) ?? null
    const temTurnos = !!cfg?.ativo && (cfg?.turnos.length ?? 0) > 0

    // Fora do turno hoje ≠ sem configuração: exibe os horários da semana
    const foraDoTurno = temTurnos && !turnoHoje
    const turnoExibido = turnoHoje ?? (foraDoTurno ? cfg!.turnos[0] : null)

    const statusAtual: StatusSinotico = foraDoTurno
      ? 'FOLGA'
      : computeStatusSinotico({ turno: turnoHoje, reg, hoje, agora })

    return {
      pontoId:    p.id,
      nome:       p.nome,
      endereco:   p.endereco ?? null,
      latitude:   p.latitude  ?? null,
      longitude:  p.longitude ?? null,
      configurado: temTurnos,
      horaAbertura:   turnoExibido?.horaAbertura   ?? null,
      horaFechamento: turnoExibido?.horaFechamento ?? null,
      diasSemanaTurno: turnoExibido?.diasSemana    ?? null,
      checkinFechamentoObrigatorio: turnoExibido?.checkinFechamentoObrigatorio ?? false,
      statusAtual,
      abertaEm:              reg?.abertaEm    ?? null,
      operadorAbertura:      reg?.operador?.nome          ?? reg?.supervisor?.nome          ?? null,
      fechamentoEm:          reg?.fechamentoEm   ?? null,
      operadorFechamento:    reg?.fechamentoOperador?.nome ?? reg?.fechamentoSupervisor?.nome ?? null,
      statusFechamento:      reg?.statusFechamento ?? null,
    }
  })
}

// ─── Histórico ────────────────────────────────────────────────────────────────

export async function getHistorico(
  tenantId: string,
  opts: { pontoId?: string; status?: string; dataInicio?: string; dataFim?: string; page: number; limit: number },
) {
  const where: Record<string, unknown> = { tenantId }
  if (opts.pontoId) where.pontoId = opts.pontoId
  if (opts.status) where.status = opts.status
  if (opts.dataInicio || opts.dataFim) {
    where.data = {
      ...(opts.dataInicio ? { gte: new Date(opts.dataInicio) } : {}),
      ...(opts.dataFim    ? { lte: new Date(opts.dataFim)    } : {}),
    }
  }

  const [registros, total] = await Promise.all([
    prisma.registroAbertura.findMany({
      where,
      include: {
        ponto:                { select: { nome: true } },
        operador:             { select: { nome: true } },
        supervisor:           { select: { nome: true } },
        fechamentoOperador:   { select: { nome: true } },
        fechamentoSupervisor: { select: { nome: true } },
        turno:                { select: { horaAbertura: true, horaFechamento: true, diasSemana: true } },
      },
      orderBy: { data: 'desc' },
      skip:  (opts.page - 1) * opts.limit,
      take:  opts.limit,
    }),
    prisma.registroAbertura.count({ where }),
  ])

  return { registros, total, page: opts.page, limit: opts.limit }
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

export async function getRanking(tenantId: string, dias = 30) {
  const dataInicio = new Date()
  dataInicio.setDate(dataInicio.getDate() - dias)
  dataInicio.setUTCHours(0, 0, 0, 0)

  const registros = await prisma.registroAbertura.findMany({
    where: { tenantId, data: { gte: dataInicio } },
    include: { ponto: { select: { nome: true } } },
  })

  const byPonto = new Map<string, { nome: string; noPrazo: number; atrasado: number; ausente: number }>()

  for (const r of registros) {
    if (!byPonto.has(r.pontoId)) {
      byPonto.set(r.pontoId, { nome: r.ponto.nome, noPrazo: 0, atrasado: 0, ausente: 0 })
    }
    const e = byPonto.get(r.pontoId)!
    if (r.status === 'NO_PRAZO') e.noPrazo++
    else if (r.status === 'ATRASADO') e.atrasado++
    else e.ausente++
  }

  return Array.from(byPonto.entries())
    .map(([pontoId, d]) => {
      const total = d.noPrazo + d.atrasado + d.ausente
      return {
        pontoId,
        nome: d.nome,
        total,
        noPrazo:  d.noPrazo,
        atrasado: d.atrasado,
        ausente:  d.ausente,
        conformidade: total > 0 ? Math.round((d.noPrazo / total) * 100) : 0,
      }
    })
    .sort((a, b) => b.conformidade - a.conformidade)
}
