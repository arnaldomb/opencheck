import { prisma } from '@opencheck/database'
import { aberturaQueue } from '../../infra/redis/queues.js'

const TZ = 'America/Sao_Paulo'

function hojeEmSP(): Date {
  const spDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return new Date(spDate + 'T00:00:00.000Z')
}

function calcDeadline(data: Date, horaAbertura: string, toleranciaMinutos: number): Date {
  const [h, m] = horaAbertura.split(':').map(Number)
  const d = new Date(data)
  d.setUTCHours(h, m, 0, 0)
  return new Date(d.getTime() + toleranciaMinutos * 60_000)
}

export async function registrarCheckin(
  tenantId: string,
  pontoId: string,
  opts: { operadorId?: string; nomeComputador?: string; usuarioWindows?: string },
) {
  const config = await prisma.configAbertura.findUnique({ where: { pontoId } })
  if (!config || !config.ativo)
    throw Object.assign(new Error('Ponto sem configuração de abertura ativa'), { status: 400 })

  // Verificar que o ponto pertence ao tenant
  const ponto = await prisma.ponto.findFirst({ where: { id: pontoId, tenantId } })
  if (!ponto) throw Object.assign(new Error('Ponto não encontrado'), { status: 404 })

  const hoje = hojeEmSP()
  const deadline = calcDeadline(hoje, config.horaAbertura, config.toleranciaMinutos)
  const agora = new Date()
  const status = agora <= deadline ? ('NO_PRAZO' as const) : ('ATRASADO' as const)

  const existing = await prisma.registroAbertura.findUnique({
    where: { pontoId_data: { pontoId, data: hoje } },
  })
  if (existing?.abertaEm)
    throw Object.assign(new Error('Abertura já registrada para hoje'), { status: 409 })

  const data = {
    abertaEm: agora,
    status,
    operadorId: opts.operadorId ?? null,
    nomeComputador: opts.nomeComputador ?? null,
    usuarioWindows: opts.usuarioWindows ?? null,
  }

  const registro = existing
    ? await prisma.registroAbertura.update({ where: { id: existing.id }, data })
    : await prisma.registroAbertura.create({
        data: {
          tenantId, pontoId, configId: config.id,
          data: hoje, deadlineEm: deadline,
          ...data,
        },
      })

  // Cancelar job de deadline se existir
  const jobId = registro.jobId ?? existing?.jobId
  if (jobId) {
    const job = await aberturaQueue.getJob(jobId)
    if (job) await job.remove().catch(() => {})
    await prisma.registroAbertura.update({ where: { id: registro.id }, data: { jobId: null } })
  }

  return registro
}

export async function getStatus(tenantId: string) {
  const hoje = hojeEmSP()

  const [pontos, registros] = await Promise.all([
    prisma.ponto.findMany({
      where: { tenantId, ativo: true },
      select: { id: true, nome: true, configAbertura: true },
    }),
    prisma.registroAbertura.findMany({ where: { tenantId, data: hoje } }),
  ])

  const regMap = new Map(registros.map(r => [r.pontoId, r]))

  return pontos.map(p => {
    const reg = regMap.get(p.id)
    const cfg = p.configAbertura
    return {
      pontoId: p.id,
      nome: p.nome,
      configurado: !!cfg,
      horaAbertura: cfg?.horaAbertura ?? null,
      toleranciaMinutos: cfg?.toleranciaMinutos ?? null,
      status: reg?.status ?? (cfg ? 'PENDENTE' : 'SEM_CONFIGURACAO'),
      abertaEm: reg?.abertaEm ?? null,
      deadlineEm: reg?.deadlineEm ?? (cfg ? calcDeadline(hoje, cfg.horaAbertura, cfg.toleranciaMinutos) : null),
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
