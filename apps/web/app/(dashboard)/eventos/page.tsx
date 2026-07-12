'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import {
  Bell, AlertTriangle, CheckCircle, Clock, Filter, X, Shield,
  User, ChevronDown, ChevronUp, MessageCircle, Eye, EyeOff, CheckCheck, Loader2,
  AlarmClock, RefreshCw, Wrench, XCircle,
} from 'lucide-react'

interface Ator { id: string; nome: string | null; tipo?: 'OPERADOR' | 'SUPERVISOR' }

interface Evento {
  id: string; tipo: string; criadoEm: string; ocorridoEm: string
  encaminhado: boolean
  monitorado:  boolean
  pontoId?:    string
  ponto?:      { nome: string }
  operador?:   Ator | null
  meta?:       { operadorId?: string; supervisorId?: string; codigoEvento?: string; observacao?: string }
}

interface OperadorOpt { id: string; nome: string }

const TIPO_CFG: Record<string, { label: string; badgeCls: string; iconCls: string; icon: React.ElementType }> = {
  CHECKIN:           { label: 'Check-in',          badgeCls: 'bg-green-100 text-green-700',   iconCls: 'text-green-500',  icon: CheckCircle },
  ABERTURA_CHECKIN:  { label: 'Abertura',           badgeCls: 'bg-blue-100 text-blue-700',     iconCls: 'text-blue-500',   icon: AlarmClock },
  ABERTURA_AUSENTE:  { label: 'Sem Abertura',       badgeCls: 'bg-red-100 text-red-700',       iconCls: 'text-red-600',    icon: XCircle },
  FECHAMENTO_CHECKIN:{ label: 'Fechamento',         badgeCls: 'bg-gray-100 text-gray-700',     iconCls: 'text-gray-500',   icon: AlarmClock },
  FECHAMENTO_AUSENTE:{ label: 'Sem Fechamento',     badgeCls: 'bg-red-100 text-red-700',       iconCls: 'text-red-600',    icon: XCircle },
  FALHA:             { label: 'Falha',              badgeCls: 'bg-orange-100 text-orange-700', iconCls: 'text-orange-500', icon: Clock },
  PANICO:            { label: 'Pânico',             badgeCls: 'bg-red-100 text-red-700',       iconCls: 'text-red-600',    icon: AlertTriangle },
  PANICO_SILENCIOSO: { label: 'Pânico silencioso',  badgeCls: 'bg-red-100 text-red-700',       iconCls: 'text-red-600',    icon: Shield },
  COACAO:            { label: 'Coação',             badgeCls: 'bg-purple-100 text-purple-700', iconCls: 'text-purple-600', icon: Shield },
  SUPERVISOR_ENTRADA:{ label: 'Supervisor — Entrada', badgeCls: 'bg-indigo-100 text-indigo-700', iconCls: 'text-indigo-500', icon: Shield },
  SUPERVISOR_SAIDA:  { label: 'Supervisor — Saída',   badgeCls: 'bg-indigo-50 text-indigo-500',  iconCls: 'text-indigo-400', icon: Shield },
  AVISO:             { label: 'Aviso',              badgeCls: 'bg-yellow-100 text-yellow-700', iconCls: 'text-yellow-500', icon: Bell },
  RESTAURACAO:       { label: 'Restauração',        badgeCls: 'bg-gray-100 text-gray-600',     iconCls: 'text-gray-400',   icon: RefreshCw },
  TESTE:             { label: 'Teste',              badgeCls: 'bg-gray-100 text-gray-500',     iconCls: 'text-gray-300',   icon: Wrench },
}

const COL = 'grid-cols-[20px_130px_60px_1fr_1fr_76px_96px_88px]'
const TZ = 'America/Sao_Paulo'
const today = new Date().toLocaleDateString('sv-SE', { timeZone: TZ })

export default function EventosPage() {
  const [eventos, setEventos]       = useState<Evento[]>([])
  const [loading, setLoading]       = useState(true)
  const [operadores, setOperadores] = useState<OperadorOpt[]>([])
  const [filtersOpen, setFiltersOpen]       = useState(false)
  const [sending,   setSending]     = useState<string | null>(null)
  const [sendErro,  setSendErro]    = useState('')

  // Filters
  const [filtroTipo,       setFiltroTipo]       = useState('')
  const [filtroOperador,   setFiltroOperador]   = useState('')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim,    setFiltroDataFim]    = useState('')
  const [filtroHoraInicio, setFiltroHoraInicio] = useState('')
  const [filtroHoraFim,    setFiltroHoraFim]    = useState('')

  useEffect(() => {
    apiFetch<OperadorOpt[]>('/operadores').then(setOperadores).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtroTipo)      params.set('tipo', filtroTipo)
      if (filtroOperador) params.set('operadorId', filtroOperador)
      if (filtroDataInicio) {
        params.set('dataInicio', `${filtroDataInicio}T${filtroHoraInicio || '00:00'}:00`)
      }
      if (filtroDataFim) {
        params.set('dataFim', `${filtroDataFim}T${filtroHoraFim || '23:59'}:59`)
      }
      const q = params.toString() ? `?${params.toString()}` : ''
      setEventos(await apiFetch<Evento[]>(`/eventos${q}`))
    } finally {
      setLoading(false)
    }
  }, [filtroTipo, filtroOperador, filtroDataInicio, filtroDataFim, filtroHoraInicio, filtroHoraFim])

  useEffect(() => { load() }, [load])

  function limparFiltros() {
    setFiltroTipo(''); setFiltroOperador('')
    setFiltroDataInicio(''); setFiltroDataFim('')
    setFiltroHoraInicio(''); setFiltroHoraFim('')
  }

  async function enviarWhatsApp(ev: Evento) {
    setSending(ev.id); setSendErro('')
    try {
      await apiFetch(`/eventos/${ev.id}/enviar-whatsapp`, { method: 'POST' })
      setEventos(prev => prev.map(e => e.id === ev.id ? { ...e, encaminhado: true } : e))
    } catch (err) {
      setSendErro(String(err))
      setTimeout(() => setSendErro(''), 5000)
    } finally {
      setSending(null)
    }
  }

  const temFiltro = filtroTipo || filtroOperador || filtroDataInicio || filtroDataFim

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Eventos</h1>
          <p className="text-gray-500 text-sm mt-0.5">Histórico de ocorrências e alertas</p>
        </div>
        <button
          onClick={() => setFiltersOpen(v => !v)}
          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
            temFiltro ? 'bg-ggtech-blue text-white border-ggtech-blue' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {temFiltro && (
            <span className="bg-white/30 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
              {[filtroTipo, filtroOperador, filtroDataInicio, filtroDataFim].filter(Boolean).length}
            </span>
          )}
          {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div className="card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de evento</label>
              <select className="input w-full" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                <option value="">Todos</option>
                <option value="CHECKIN">Check-in</option>
                <option value="ABERTURA_CHECKIN">Abertura</option>
                <option value="ABERTURA_AUSENTE">Sem Abertura</option>
                <option value="FECHAMENTO_CHECKIN">Fechamento</option>
                <option value="FECHAMENTO_AUSENTE">Sem Fechamento</option>
                <option value="SUPERVISOR_ENTRADA">Supervisor — Entrada</option>
                <option value="SUPERVISOR_SAIDA">Supervisor — Saída</option>
                <option value="FALHA">Falha</option>
                <option value="PANICO">Pânico</option>
                <option value="PANICO_SILENCIOSO">Pânico silencioso</option>
                <option value="COACAO">Coação</option>
                <option value="AVISO">Aviso</option>
                <option value="RESTAURACAO">Restauração</option>
                <option value="TESTE">Teste</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Operador</label>
              <select className="input w-full" value={filtroOperador} onChange={e => setFiltroOperador(e.target.value)}>
                <option value="">Todos</option>
                {operadores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data início</label>
              <div className="flex gap-1">
                <input type="date" className="input flex-1 min-w-0" max={today} value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} />
                <input type="time" className="input w-24" value={filtroHoraInicio} onChange={e => setFiltroHoraInicio(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data fim</label>
              <div className="flex gap-1">
                <input type="date" className="input flex-1 min-w-0" max={today} value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} />
                <input type="time" className="input w-24" value={filtroHoraFim} onChange={e => setFiltroHoraFim(e.target.value)} />
              </div>
            </div>
          </div>
          {temFiltro && (
            <div className="flex justify-end">
              <button onClick={limparFiltros} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Bell className="h-4 w-4 text-ggtech-blue" />
          <h2 className="font-heading font-semibold text-gray-900 text-sm">{eventos.length} evento(s)</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
          </div>
        ) : eventos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <Bell className="h-10 w-10 text-gray-200" />
            <p className="text-sm">Nenhum evento encontrado</p>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className={`hidden lg:grid ${COL} gap-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide`}>
              <span />
              <span>Tipo</span>
              <span>Código</span>
              <span>Ponto</span>
              <span>Operador</span>
              <span className="text-center">WhatsApp</span>
              <span className="text-center">Monitoramento</span>
              <span className="text-right">Data/Hora</span>
            </div>

            <ul className="divide-y divide-gray-50">
              {eventos.map(ev => {
                const cfg  = TIPO_CFG[ev.tipo] ?? { label: ev.tipo, badgeCls: 'bg-gray-100 text-gray-600', iconCls: 'text-gray-400', icon: Bell }
                const Icon = cfg.icon
                const ts   = ev.ocorridoEm ?? ev.criadoEm
                return (
                  <li key={ev.id} className={`grid ${COL} gap-3 items-center px-5 py-2.5 hover:bg-gray-50 transition-colors`}>

                    {/* Icon */}
                    <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.iconCls}`} />

                    {/* Tipo badge */}
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cfg.badgeCls}`}>
                      {cfg.label}
                    </span>

                    {/* Código */}
                    <span className="text-xs text-gray-400 font-mono">
                      {ev.meta?.codigoEvento ? `#${ev.meta.codigoEvento}` : '—'}
                    </span>

                    {/* Ponto */}
                    <div className="min-w-0">
                      {ev.ponto
                        ? <p className="text-sm text-gray-700 truncate">{ev.ponto.nome}</p>
                        : <span className="text-xs text-gray-300">—</span>
                      }
                    </div>

                    {/* Operador / Supervisor */}
                    <div className="min-w-0 flex items-center gap-1.5">
                      {ev.operador?.nome ? (
                        <>
                          <User className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                          <span className="text-sm text-gray-600 truncate">{ev.operador.nome}</span>
                          {ev.operador.tipo === 'SUPERVISOR' && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600 flex-shrink-0">
                              Supervisor
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>

                    {/* WhatsApp — clicável para enviar */}
                    <div className="flex justify-center">
                      {ev.encaminhado ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                          <CheckCheck className="h-3 w-3" /> Enviado
                        </span>
                      ) : (
                        <button
                          onClick={() => enviarWhatsApp(ev)}
                          disabled={sending === ev.id}
                          title="Enviar alerta via WhatsApp"
                          className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 hover:bg-green-50 hover:text-green-700 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait"
                        >
                          {sending === ev.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <MessageCircle className="h-3 w-3" />}
                          Enviar
                        </button>
                      )}
                    </div>

                    {/* Monitoramento */}
                    <div className="flex justify-center">
                      {ev.monitorado ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                          <Eye className="h-3 w-3" /> Enviado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                          <EyeOff className="h-3 w-3" /> Pendente
                        </span>
                      )}
                    </div>

                    {/* Data/hora */}
                    <div className="text-right">
                      <time className="text-xs text-gray-500 block">{new Date(ts).toLocaleDateString('pt-BR', { timeZone: TZ })}</time>
                      <time className="text-xs text-gray-400 block">{new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}</time>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {sendErro && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg max-w-sm">
          {sendErro}
        </div>
      )}
    </div>
  )
}
