'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { ShieldCheck, ArrowLeft, MapPin, Clock, LogIn, LogOut, AlertTriangle } from 'lucide-react'

interface Visita {
  supervisorId: string
  supervisorNome: string
  pontoId: string
  pontoNome: string
  entradaEm: string | null
  saidaEm: string | null
  duracaoMinutos: number | null
  emAberto: boolean
}

interface RondasResponse {
  visitas: Visita[]
  periodo: { dataInicio: string; dataFim: string }
}

interface Supervisor { id: string; nome: string }
interface Ponto { id: string; nome: string }

function fmtDataHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuracao(min: number | null): string {
  if (min === null) return '—'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${min % 60}min`
}

function hojeISO(offsetDias = 0): string {
  const d = new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export default function RondasPage() {
  const [visitas, setVisitas]         = useState<Visita[]>([])
  const [supervisores, setSupervisores] = useState<Supervisor[]>([])
  const [pontos, setPontos]           = useState<Ponto[]>([])
  const [loading, setLoading]         = useState(true)
  const [supervisorId, setSupervisorId] = useState('')
  const [pontoId, setPontoId]         = useState('')
  const [dataInicio, setDataInicio]   = useState(hojeISO(-7))
  const [dataFim, setDataFim]         = useState(hojeISO())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (supervisorId) params.set('supervisorId', supervisorId)
      if (pontoId)      params.set('pontoId', pontoId)
      if (dataInicio)   params.set('dataInicio', dataInicio)
      if (dataFim)      params.set('dataFim', dataFim)
      const data = await apiFetch<RondasResponse>(`/supervisores/rondas?${params}`)
      setVisitas(data.visitas)
    } finally { setLoading(false) }
  }, [supervisorId, pontoId, dataInicio, dataFim])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    apiFetch<Supervisor[]>('/supervisores').then(setSupervisores).catch(() => {})
    apiFetch<Ponto[]>('/pontos').then(setPontos).catch(() => {})
  }, [])

  const emAberto = visitas.filter(v => v.emAberto).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/supervisores" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-ggtech-blue transition-colors mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Supervisores
          </Link>
          <h1 className="font-heading font-bold text-2xl text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-600" /> Rondas de supervisão
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {visitas.length} visita(s) no período{emAberto > 0 ? ` · ${emAberto} em aberto` : ''}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Supervisor</label>
          <select className="input" value={supervisorId} onChange={e => setSupervisorId(e.target.value)}>
            <option value="">Todos</option>
            {supervisores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Ponto</label>
          <select className="input" value={pontoId} onChange={e => setPontoId(e.target.value)}>
            <option value="">Todos</option>
            {pontos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="label">De</label>
          <input type="date" className="input" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div>
          <label className="label">Até</label>
          <input type="date" className="input" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : visitas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <ShieldCheck className="h-12 w-12 text-gray-200" />
          <p className="font-medium">Nenhuma ronda registrada no período</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Supervisor</th>
                <th className="px-4 py-3">Ponto</th>
                <th className="px-4 py-3">Entrada</th>
                <th className="px-4 py-3">Saída</th>
                <th className="px-4 py-3">Permanência</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visitas.map((v, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{v.supervisorNome}</td>
                  <td className="px-4 py-3 text-gray-500">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-gray-300" /> {v.pontoNome}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <span className="inline-flex items-center gap-1"><LogIn className="h-3.5 w-3.5 text-green-400" /> {fmtDataHora(v.entradaEm)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <span className="inline-flex items-center gap-1"><LogOut className="h-3.5 w-3.5 text-gray-300" /> {fmtDataHora(v.saidaEm)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-gray-300" /> {fmtDuracao(v.duracaoMinutos)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {v.emAberto ? (
                      <span className="badge-yellow inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Em aberto</span>
                    ) : !v.entradaEm ? (
                      <span className="badge-gray">Saída sem entrada</span>
                    ) : (
                      <span className="badge-green">Concluída</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
