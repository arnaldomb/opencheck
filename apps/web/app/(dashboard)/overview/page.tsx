'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import {
  MapPin, Users, Bell, AlertTriangle, CheckCircle,
  TrendingUp, Activity, RefreshCw, ShieldAlert, Siren,
  HandMetal, Cpu, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

interface Ponto    { id: string; ativo: boolean }
interface Operador { id: string; ativo: boolean }
interface EventoStats { total: number; checkins: number; alertas: number; hoje: number }
interface Evento {
  id: string
  tipo: string
  ocorridoEm: string
  ponto?: { nome: string }
  vigilante?: { id: string; nome: string | null } | null
  meta?: Record<string, unknown> | null
  monitorado?: boolean
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: number | string; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-heading font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

const TIPOS: Record<string, { label: string; cls: string; icon: React.ElementType; dot: string }> = {
  CHECKIN:          { label: 'Check-in',          cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200',  icon: CheckCircle,  dot: 'bg-emerald-500' },
  PANICO:           { label: 'Pânico',            cls: 'bg-red-50    text-red-700     ring-red-200',       icon: Siren,        dot: 'bg-red-500' },
  PANICO_SILENCIOSO:{ label: 'Pânico silencioso', cls: 'bg-red-50    text-red-700     ring-red-200',       icon: ShieldAlert,  dot: 'bg-red-400' },
  COACAO:           { label: 'Coação',            cls: 'bg-orange-50 text-orange-700  ring-orange-200',    icon: HandMetal,    dot: 'bg-orange-500' },
  FALHA:            { label: 'Falha',             cls: 'bg-yellow-50 text-yellow-700  ring-yellow-200',    icon: Cpu,          dot: 'bg-yellow-500' },
}

function tipoInfo(tipo: string) {
  return TIPOS[tipo] ?? { label: tipo, cls: 'bg-gray-50 text-gray-600 ring-gray-200', icon: Activity, dot: 'bg-gray-400' }
}

const TZ = 'America/Sao_Paulo'

function fmtTempo(iso: string) {
  const d      = new Date(iso)
  const now    = new Date()
  const diffMs  = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1)  return 'agora'
  if (diffMin < 60) return `${diffMin}min atrás`

  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
  }

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

function isAlerta(tipo: string) {
  return ['PANICO', 'PANICO_SILENCIOSO', 'COACAO'].includes(tipo)
}

export default function OverviewPage() {
  const [pontos,      setPontos]      = useState<Ponto[]>([])
  const [operadores,  setOperadores]  = useState<Operador[]>([])
  const [evStats,     setEvStats]     = useState<EventoStats | null>(null)
  const [eventos,     setEventos]     = useState<Evento[]>([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [lastUpdate,  setLastUpdate]  = useState<Date>(new Date())

  const fetchEventos = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else         setRefreshing(true)
    try {
      const [pts, vigs, evs, evList] = await Promise.all([
        apiFetch<Ponto[]>('/pontos').catch(() => [] as Ponto[]),
        apiFetch<Operador[]>('/operadores').catch(() => [] as Operador[]),
        apiFetch<EventoStats>('/eventos/stats').catch(() => null),
        apiFetch<Evento[]>('/eventos?limit=15').catch(() => [] as Evento[]),
      ])
      setPontos(pts as Ponto[])
      setOperadores(vigs as Operador[])
      setEvStats(evs as EventoStats | null)
      setEventos(evList as Evento[])
      setLastUpdate(new Date())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchEventos()
    const interval = setInterval(() => fetchEventos(true), 30000)
    return () => clearInterval(interval)
  }, [fetchEventos])

  const pontosAtivos     = pontos.filter(p => p.ativo).length
  const operadoresAtivos = operadores.filter(v => v.ativo).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl text-gray-900">Visão Geral</h1>
        <p className="text-gray-500 text-sm mt-1">Resumo da operação em tempo real</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Pontos ativos"     value={pontosAtivos}           sub={`de ${pontos.length} cadastrado(s)`} icon={MapPin}        color="bg-ggtech-blue" />
        <StatCard label="Operadores ativos" value={operadoresAtivos}      icon={Users}         color="bg-emerald-500" />
        <StatCard label="Eventos hoje"     value={evStats?.hoje ?? 0}     icon={Activity}      color="bg-sky-500" />
        <StatCard label="Check-ins"        value={evStats?.checkins ?? 0} icon={CheckCircle}   color="bg-violet-500" />
        <StatCard label="Alertas"          value={evStats?.alertas ?? 0}  icon={AlertTriangle} color="bg-red-500" />
        <StatCard label="Total de eventos" value={evStats?.total ?? 0}    icon={TrendingUp}    color="bg-amber-500" />
      </div>

      {/* Últimos eventos */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-ggtech-blue" />
            <h2 className="font-heading font-semibold text-gray-900">Últimos eventos</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{eventos.length}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}
            </span>
            <button
              onClick={() => fetchEventos(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              title="Atualizar"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {eventos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <CheckCircle className="h-8 w-8 text-gray-300" />
            <p className="text-sm">Nenhum evento registrado</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-50">
              {eventos.map(ev => {
                const t         = tipoInfo(ev.tipo)
                const TipoIcon  = t.icon
                const alerta    = isAlerta(ev.tipo)
                const vigNome   = ev.vigilante?.nome ?? null
                const obs       = ev.meta?.observacao as string | undefined

                return (
                  <li key={ev.id} className={`px-6 py-3.5 flex items-center gap-4 hover:bg-gray-50 transition-colors ${alerta ? 'border-l-2 border-red-400' : ''}`}>
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${alerta ? 'bg-red-100' : 'bg-gray-100'}`}>
                      <TipoIcon className={`h-4 w-4 ${alerta ? 'text-red-600' : 'text-gray-500'}`} />
                    </div>

                    {/* Badge + info */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${t.cls}`}>
                          {t.label}
                        </span>
                        {ev.ponto && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="h-3 w-3 text-gray-400" />
                            {ev.ponto.nome}
                          </span>
                        )}
                        {vigNome && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Users className="h-3 w-3 text-gray-400" />
                            {vigNome}
                          </span>
                        )}
                      </div>
                      {obs && <p className="text-xs text-gray-400 truncate">{obs}</p>}
                    </div>

                    {/* Time */}
                    <time className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                      {fmtTempo(ev.ocorridoEm)}
                    </time>
                  </li>
                )
              })}
            </ul>

            {/* Footer link */}
            <div className="px-6 py-3 border-t border-gray-50 bg-gray-50/50">
              <Link
                href="/eventos"
                className="text-xs text-ggtech-blue hover:underline flex items-center gap-1 w-fit"
              >
                Ver todos os eventos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
