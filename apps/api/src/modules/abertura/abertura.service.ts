import { prisma } from '@opencheck/database'
import { aberturaQueue } from '../../infra/redis/queues.js'

const TZ = 'America/Sao_Paulo'

function hojeEmSP(): Date {
  const spDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return new Date(spDate + 'T00:00:00.000Z')
}

function diaSemanaEmSP(): number {
  const spNow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }))
  return spNow.getDay()
}

function calcDeadline(data: Date, horaAbertura: string, toleranciaMinutos: number): Date {
  // data = hojeEmSP() = new Date(spDate + 'T00:00:00.000Z')
  // toISOString().slice(0,10) extrai o date string SP correto sem conversão de timezone
  const spDate = data.toISOString().slice(0, 10)
  const [h, m] = horaAbertura.split(':').map(Number)
  const ms = Date.parse(`${spDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`)
  return new Date(ms + toleranciaMinutos * 60_000)
}

export async function registrarCheckin(
  tenantId: string,
  pontoId: string,
  opts: { operadorId?: string; nomeComputador?: string; usuarioWindows?: string },
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
    // Turno foi atualizado com novo prazo — permite novo check-in
  }

  const data = {
    abertaEm: agora,
    status,
    turnoId:        turno.id,
    operadorId:     opts.operadorId ?? null,
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

  await prisma.evento.create({
    data: {
      tenantId,
      pontoId,
      tipo: 'ABERTURA_CHECKIN',
      meta: {
        registroAberturaId: registro.id,
        statusAbertura: status,
        operadorId: opts.operadorId ?? null,
        nomeComputador: opts.nomeComputador ?? null,
        usuarioWindows: opts.usuarioWindows ?? null,
      },
    },
  })

  return registro
}

export async function getStatus(tenantId: string) {
  const hoje = hojeEmSP()
  const diaSemana = diaSemanaEmSP()

  const [pontos, registros] = await Promise.all([
    prisma.ponto.findMany({
      where: { tenantId, ativo: true },
      select: {
        id: true, nome: true,
        configAbertura: {
          include: { turnos: { where: { ativo: true } } },
        },
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

    return {
      pontoId: p.id,
      nome: p.nome,
      configurado: !!cfg && !!turno,
      horaAbertura: turno?.horaAbertura ?? null,
      toleranciaMinutos: turno?.toleranciaMinutos ?? null,
      status: reg?.status ?? (turno ? 'PENDENTE' : 'SEM_CONFIGURACAO'),
      abertaEm: reg?.abertaEm ?? null,
      deadlineEm: reg?.deadlineEm ?? (turno ? calcDeadline(hoje, turno.horaAbertura, turno.toleranciaMinutos) : null),
    }
  })
}

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
        ponto:    { select: { nome: true } },
        operador: { select: { nome: true } },
        turno:    { select: { horaAbertura: true, diasSemana: true } },
      },
      orderBy: { data: 'desc' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.registroAbertura.count({ where }),
  ])

  return { registros, total, page: opts.page, limit: opts.limit }
}

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
        noPrazo: d.noPrazo,
        atrasado: d.atrasado,
        ausente: d.ausente,
        conformidade: total > 0 ? Math.round((d.noPrazo / total) * 100) : 0,
      }
    })
    .sort((a, b) => b.conformidade - a.conformidade)
}
