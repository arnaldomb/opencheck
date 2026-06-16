'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { Save, RefreshCw, Info } from 'lucide-react'

const TIPOS_EVENTO = [
  { tipo: 'CHECKIN',             label: 'Check-in de ciclo',           grupo: 'Ciclo' },
  { tipo: 'PANICO',              label: 'Pânico',                      grupo: 'Alarmes' },
  { tipo: 'PANICO_SILENCIOSO',   label: 'Pânico silencioso',           grupo: 'Alarmes' },
  { tipo: 'COACAO',              label: 'Coação',                      grupo: 'Alarmes' },
  { tipo: 'FALHA',               label: 'Falha de dispositivo',        grupo: 'Alarmes' },
  { tipo: 'AVISO',               label: 'Aviso',                       grupo: 'Alarmes' },
  { tipo: 'RESTAURACAO',         label: 'Restauração',                 grupo: 'Alarmes' },
  { tipo: 'TESTE',               label: 'Teste',                       grupo: 'Alarmes' },
  { tipo: 'ABERTURA_CHECKIN',    label: 'Abertura — check-in no prazo',grupo: 'Abertura' },
  { tipo: 'ABERTURA_AUSENTE',    label: 'Abertura — não abriu',        grupo: 'Abertura' },
  { tipo: 'FECHAMENTO_CHECKIN',  label: 'Fechamento — check-in',       grupo: 'Fechamento' },
  { tipo: 'FECHAMENTO_AUSENTE',  label: 'Fechamento — não fechou',     grupo: 'Fechamento' },
] as const

const TIPOS_CTRLSAFE = ['alert', 'restore', 'test'] as const

type TipoEvento = typeof TIPOS_EVENTO[number]['tipo']

interface Config {
  id: string
  codigos: Record<string, string>
  tiposCtrlSafe: Record<string, string>
  atualizadoEm: string
}

const GRUPOS = ['Ciclo', 'Alarmes', 'Abertura', 'Fechamento']

export default function EventosConfigPage() {
  const [config, setConfig]     = useState<Config | null>(null)
  const [codigos, setCodigos]   = useState<Record<string, string>>({})
  const [tipos, setTipos]       = useState<Record<string, string>>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<Config>('/superadmin/eventos-config')
      setConfig(data)
      setCodigos(data.codigos ?? {})
      setTipos(data.tiposCtrlSafe ?? {})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    try {
      await apiFetch('/superadmin/eventos-config', {
        method: 'PUT',
        body: JSON.stringify({ codigos, tiposCtrlSafe: tipos }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Códigos de Eventos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Mapeamento global de TipoEvento → código CTRL+SAFE. Usado como padrão quando o evento não define um código próprio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ggtech-blue text-white text-sm font-medium hover:bg-ggtech-blue/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando…' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
        <span>
          <strong>Prioridade de código:</strong> código do evento individual (salvo em <code>Evento.meta.codigoEvento</code>) &gt; esta configuração global &gt; fallback hardcoded.
          Para abertura, configure também os códigos <em>dentro do prazo</em> e <em>atrasado</em> individualmente em cada ponto.
        </span>
      </div>

      {GRUPOS.map(grupo => {
        const itens = TIPOS_EVENTO.filter(t => t.grupo === grupo)
        return (
          <div key={grupo} className="card">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wider mb-4">{grupo}</h2>
            <div className="divide-y divide-gray-100">
              {itens.map(({ tipo, label }) => (
                <div key={tipo} className="py-3 grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-5">
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{tipo}</p>
                  </div>
                  <div className="col-span-3">
                    <label className="text-xs text-gray-500 mb-1 block">Código CTRL+SAFE</label>
                    <input
                      type="text"
                      value={codigos[tipo] ?? ''}
                      onChange={e => setCodigos(prev => ({ ...prev, [tipo]: e.target.value }))}
                      placeholder="ex: 1120"
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="text-xs text-gray-500 mb-1 block">Tipo CTRL+SAFE</label>
                    <select
                      value={tipos[tipo] ?? ''}
                      onChange={e => setTipos(prev => ({ ...prev, [tipo]: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-ggtech-blue bg-white"
                    >
                      <option value="">— padrão (alert) —</option>
                      {TIPOS_CTRLSAFE.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {config && (
        <p className="text-xs text-gray-400 text-right">
          Última atualização: {new Date(config.atualizadoEm).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}
