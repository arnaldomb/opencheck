import { randomBytes } from 'crypto'
import { prisma } from '@opencheck/database'

export function generateAgentKey(env: 'live' | 'test' = 'live'): string {
  // oc_live_<14 base64url chars> ≈ 22 chars total, ~84 bits of entropy
  const random = randomBytes(10).toString('base64url')
  return `oc_${env}_${random}`
}

export async function getConfigCiclo(pontoId: string, tenantId: string) {
  // Try ponto-specific first, fall back to tenant default
  const specific = await prisma.configCiclo.findFirst({
    where: { pontoId },
    include: { agendas: { where: { ativo: true } } },
  })
  if (specific) return specific

  return prisma.configCiclo.findFirst({
    where: { tenantId, pontoId: null },
    include: { agendas: { where: { ativo: true } } },
  })
}

// Returns ISO-8601 timestamp with local timezone offset (e.g. 2026-04-26T00:32:23.524-03:00).
// Node's toISOString() always returns UTC ("Z"); this respects the TZ env var instead.
export function nowLocal(): string {
  const now = new Date()
  const offsetMin = now.getTimezoneOffset()           // positive = behind UTC (e.g. BRT = 180)
  const sign = offsetMin <= 0 ? '+' : '-'
  const absMin = Math.abs(offsetMin)
  const hh = String(Math.floor(absMin / 60)).padStart(2, '0')
  const mm = String(absMin % 60).padStart(2, '0')
  const local = new Date(now.getTime() - offsetMin * 60_000)
  return `${local.toISOString().slice(0, -1)}${sign}${hh}:${mm}`
}

export async function getExecucaoAtiva(pontoId: string) {
  return prisma.execucaoCiclo.findFirst({
    where: { pontoId, status: 'EM_ANDAMENTO' },
    orderBy: { iniciadoEm: 'desc' },
  })
}

// Returns true if current time falls within any active agenda for the given config.
// Handles overnight shifts (e.g. 17:00–06:00) by checking yesterday's diasSemana
// for the early-morning portion of the shift.
export function dentroDeAgenda(agendas: { diasSemana: number[]; horaInicio: string; horaFim: string }[]): boolean {
  if (!agendas.length) return true

  const agora = new Date()
  const diaSemana = agora.getDay()            // 0=Dom … 6=Sab (today)
  const diaOntem  = (diaSemana + 6) % 7       // yesterday
  const hhmm = agora.toTimeString().slice(0, 5) // "HH:MM"

  return agendas.some(a => {
    const overnight = a.horaFim <= a.horaInicio   // e.g. "06:00" <= "17:00"
    if (!overnight) {
      return a.diasSemana.includes(diaSemana) && hhmm >= a.horaInicio && hhmm < a.horaFim
    }
    // Evening portion: today's day starts the shift
    const inEvening = a.diasSemana.includes(diaSemana) && hhmm >= a.horaInicio
    // Morning portion: yesterday's day started the shift, still before horaFim
    const inMorning = a.diasSemana.includes(diaOntem)  && hhmm <  a.horaFim
    return inEvening || inMorning
  })
}
