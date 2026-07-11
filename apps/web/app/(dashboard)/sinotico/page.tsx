'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { apiFetch } from '@/lib/api'
import {
  MapPin, RefreshCw, AlarmClock, LogOut, User, Clock,
  CheckCircle2, XCircle, AlertTriangle, Minus, Settings,
  LayoutGrid, Map, Search, X, Moon,
} from 'lucide-react'
import Link from 'next/link'

const MapaSinotico = dynamic(() => import('./MapaSinotico'), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] flex items-center justify-center bg-gray-100 rounded-xl border border-gray-200">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  ),
})

type StatusSinotico =
  | 'ABERTA'
  | 'FECHADA'
  | 'PENDENTE'
  | 'AUSENTE'
  | 'FECHAMENTO_PENDENTE'
  | 'FOLGA'
  | 'SEM_CONFIGURACAO'

interface PontoSinotico {
  pontoId: string
  nome: string
  endereco: string | null
  latitude: number | null
  longitude: number | null
  configurado: boolean
  horaAbertura: string | null
  horaFechamento: string | null
  diasSemanaTurno: number[] | null
  checkinFechamentoObrigatorio: boolean
  statusAtual: StatusSinotico
  abertaEm: string | null
  operadorAbertura: string | null
  fechamentoEm: string | null
  operadorFechamento: string | null
  statusFechamento: string | null
}

const STATUS_CONFIG: Record<StatusSinotico, {
  label: string
  bg: string
  border: string
  badge: string
  badgeText: string
  icon: React.ElementType
  iconColor: string
  dot: string
}> = {
  ABERTA: {
    label: 'Aberta',
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-800',
    badgeText: 'Aberta',
    icon: CheckCircle2,
    iconColor: 'text-green-500',
    dot: 'bg-green-500',
  },
  FECHADA: {
    label: 'Fechada',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-600',
    badgeText: 'Fechada',
    icon: Minus,
    iconColor: 'text-slate-400',
    dot: 'bg-slate-400',
  },
  PENDENTE: {
    label: 'Aguardando abertura',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-800',
    badgeText: 'Aguardando',
    icon: Clock,
    iconColor: 'text-yellow-500',
    dot: 'bg-yellow-400',
  },
  AUSENTE: {
    label: 'Não abriu',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-800',
    badgeText: 'Não abriu',
    icon: XCircle,
    iconColor: 'text-red-500',
    dot: 'bg-red-500',
  },
  FECHAMENTO_PENDENTE: {
    label: 'Fechamento pendente',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-800',
    badgeText: 'Fechar agora',
    icon: AlertTriangle,
    iconColor: 'text-orange-500',
    dot: 'bg-orange-500',
  },
  FOLGA: {
    label: 'Fora do turno hoje',
    bg: 'bg-indigo-50/50',
    border: 'border-indigo-100',
    badge: 'bg-indigo-50 text-indigo-500',
    badgeText: 'Folga hoje',
    icon: Moon,
    iconColor: 'text-indigo-400',
    dot: 'bg-indigo-300',
  },
  SEM_CONFIGURACAO: {
    label: 'Sem configuração',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    badge: 'bg-gray-100 text-gray-500',
    badgeText: 'Sem config',
    icon: Settings,
    iconColor: 'text-gray-400',
    dot: 'bg-gray-300',
  },
}

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// [1,2,3,4,5] → "Seg–Sex" · [] → "Todos os dias" · [1,3,5] → "Seg, Qua, Sex"
function fmtDias(dias: number[] | null): string {
  if (!dias || dias.length === 0) return 'Todos os dias'
  const sorted = [...dias].sort()
  const consecutivos = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (consecutivos && sorted.length > 2) {
    return `${DIAS_CURTOS[sorted[0]]}–${DIAS_CURTOS[sorted[sorted.length - 1]]}`
  }
  return sorted.map(d => DIAS_CURTOS[d]).join(', ')
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function StatusDot({ status }: { status: StatusSinotico }) {
  const cfg = STATUS_CONFIG[status]
  const pulse = status === 'AUSENTE' || status === 'FECHAMENTO_PENDENTE'
  return (
    <span className="relative flex h-3 w-3">
      {pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-75`} />}
      <span className={`relative inline-flex h-3 w-3 rounded-full ${cfg.dot}`} />
    </span>
  )
}

function PontoCard({ ponto }: { ponto: PontoSinotico }) {
  const cfg = STATUS_CONFIG[ponto.statusAtual]
  const Icon = cfg.icon

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 space-y-3 transition-all`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={ponto.statusAtual} />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{ponto.nome}</p>
            {ponto.endereco && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{ponto.endereco}</p>
            )}
          </div>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badge}`}>
          <Icon className={`h-3 w-3 ${cfg.iconColor}`} />
          {cfg.badgeText}
        </span>
      </div>

      {/* Horários */}
      {ponto.configurado && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {ponto.statusAtual === 'FOLGA' && (
            <p className="col-span-2 text-xs text-indigo-500 bg-white/70 rounded-lg px-2 py-1.5">
              Opera <strong>{fmtDias(ponto.diasSemanaTurno)}</strong> — sem turno hoje
            </p>
          )}
          <div className="bg-white/70 rounded-lg p-2 space-y-0.5">
            <div className="flex items-center gap-1 text-gray-500">
              <AlarmClock className="h-3 w-3 text-green-500" /> Abertura
            </div>
            <p className="font-medium text-gray-800">{ponto.horaAbertura ?? '—'}</p>
            {ponto.abertaEm && (
              <p className="text-gray-500">às {fmt(ponto.abertaEm)}
                {ponto.operadorAbertura && <span className="text-gray-400"> · {ponto.operadorAbertura}</span>}
              </p>
            )}
          </div>
          <div className="bg-white/70 rounded-lg p-2 space-y-0.5">
            <div className="flex items-center gap-1 text-gray-500">
              <LogOut className="h-3 w-3 text-orange-400" /> Fechamento
            </div>
            {ponto.horaFechamento ? (
              <>
                <p className="font-medium text-gray-800">{ponto.horaFechamento}</p>
                {ponto.fechamentoEm ? (
                  <p className="text-gray-500">às {fmt(ponto.fechamentoEm)}
                    {ponto.operadorFechamento
                      ? <span className="text-gray-400"> · {ponto.operadorFechamento}</span>
                      : ponto.statusFechamento === 'AUTO_FECHADO'
                        ? <span className="text-gray-400"> · automático</span>
                        : null
                    }
                  </p>
                ) : (
                  <p className="text-gray-400">
                    {ponto.checkinFechamentoObrigatorio ? 'check-in obrigatório' : 'automático'}
                  </p>
                )}
              </>
            ) : (
              <p className="text-gray-400 font-medium">—</p>
            )}
          </div>
        </div>
      )}

      {/* Ação rápida */}
      <div className="flex items-center justify-between pt-1 border-t border-white/60">
        {ponto.operadorAbertura && !ponto.abertaEm === false ? (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <User className="h-3 w-3" />
            <span className="truncate max-w-[120px]">{ponto.operadorAbertura}</span>
          </div>
        ) : (
          <span />
        )}
        <Link href={`/pontos/${ponto.pontoId}`}
          className="text-xs text-ggtech-blue hover:underline font-medium flex items-center gap-1">
          <Settings className="h-3 w-3" /> Configurar
        </Link>
      </div>
    </div>
  )
}

const ORDER: StatusSinotico[] = ['AUSENTE', 'FECHAMENTO_PENDENTE', 'ABERTA', 'PENDENTE', 'FECHADA', 'FOLGA', 'SEM_CONFIGURACAO']

export default function SinoticoPage() {
  const [pontos, setPontos]         = useState<PontoSinotico[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [filtro, setFiltro]         = useState<StatusSinotico | ''>('')
  const [view, setView]             = useState<'cards' | 'mapa'>('cards')
  const [busca, setBusca]           = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const data = await apiFetch<PontoSinotico[]>('/abertura/sinotico')
      setPontos(data)
      setLastUpdate(new Date())
    } catch {
      // silently fail on refresh
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const t = setInterval(() => load(true), 60_000)
    return () => clearInterval(t)
  }, [load])

  const contagem = ORDER.reduce((acc, s) => {
    acc[s] = pontos.filter(p => p.statusAtual === s).length
    return acc
  }, {} as Record<string, number>)

  const filtered = (filtro ? pontos.filter(p => p.statusAtual === filtro) : pontos)
    .filter(p =>
      busca.trim() === '' ||
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (p.endereco ?? '').toLowerCase().includes(busca.toLowerCase())
    )
    .slice()
    .sort((a, b) => ORDER.indexOf(a.statusAtual) - ORDER.indexOf(b.statusAtual))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900 flex items-center gap-2">
            <MapPin className="h-6 w-6 text-ggtech-blue" /> Sinótico
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Status em tempo real de todas as lojas/pontos
            {lastUpdate && (
              <span className="ml-2 text-gray-400">
                · atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Cards / Mapa */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setView('cards')}
              className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${
                view === 'cards' ? 'bg-ggtech-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <LayoutGrid className="h-4 w-4" /> Cards
            </button>
            <button
              onClick={() => setView('mapa')}
              className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${
                view === 'mapa' ? 'bg-ggtech-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Map className="h-4 w-4" /> Mapa
            </button>
          </div>
          <button onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {ORDER.map(s => {
          const cfg = STATUS_CONFIG[s]
          const Icon = cfg.icon
          const count = contagem[s] ?? 0
          return (
            <button key={s}
              onClick={() => { setFiltro(filtro === s ? '' : s); setView('cards') }}
              className={`rounded-xl border p-3 text-center transition-all ${
                filtro === s
                  ? `${cfg.border} ${cfg.bg} ring-2 ring-offset-1 ${cfg.border.replace('border-', 'ring-')}`
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <Icon className={`h-5 w-5 mx-auto mb-1 ${cfg.iconColor}`} />
              <p className="text-xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-500 leading-tight">{cfg.label}</p>
            </button>
          )
        })}
      </div>

      {/* Vista Mapa */}
      {view === 'mapa' && (
        <MapaSinotico pontos={pontos} />
      )}

      {/* Vista Cards */}
      {view === 'cards' && (
        <>
          {/* Barra de busca */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar loja ou endereço..."
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="card text-center py-16">
              <MapPin className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {busca
                  ? `Nenhum resultado para "${busca}"`
                  : filtro
                    ? `Nenhum ponto com status "${STATUS_CONFIG[filtro].label}"`
                    : 'Nenhum ponto cadastrado'}
              </p>
              {!filtro && !busca && (
                <p className="text-sm text-gray-400 mt-1">
                  Cadastre pontos em <Link href="/pontos" className="text-ggtech-blue hover:underline">Pontos</Link> e configure os horários de abertura.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(p => <PontoCard key={p.pontoId} ponto={p} />)}
            </div>
          )}

          {(filtro || busca) && (
            <div className="text-center flex items-center justify-center gap-4">
              {filtro && (
                <button onClick={() => setFiltro('')} className="text-sm text-ggtech-blue hover:underline">
                  Limpar filtro de status
                </button>
              )}
              {busca && (
                <button onClick={() => setBusca('')} className="text-sm text-ggtech-blue hover:underline">
                  Limpar busca
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
