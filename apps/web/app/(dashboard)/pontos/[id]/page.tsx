'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import {
  MapPin, ArrowLeft, Save, Trash2, Loader2, Shield,
  Key, Copy, RefreshCw, Plus, Check, CheckCircle2, X, AlarmClock, Bell,
  LogOut,
} from 'lucide-react'

interface Ponto {
  id: string; nome: string; descricao?: string; endereco?: string
  latitude?: number; longitude?: number
  ativo: boolean; canalAlerta?: string; agentKey?: string; agentKeyAt?: string
  ctrlsafeAccount?: string; ctrlsafePartition?: string
  ctrlsafeZone?: string; ctrlsafeReceiver?: string; ctrlsafeLine?: string
  ctrlsafeLicenseKey?: string; ctrlsafeAgentToken?: string; ctrlsafeInstallId?: string
}
interface Operador { id: string; nome: string; ativo: boolean; pontos?: { id: string; nome: string }[]; codigo?: string }
interface TurnoAbertura {
  id?: string
  diasSemana: number[]
  horaAbertura: string
  toleranciaMinutos: number
  horaFechamento?: string
  toleranciaFechamentoMinutos: number
  checkinFechamentoObrigatorio: boolean
}
interface ConfigAberturaData {
  id?: string; emailAlerta?: string; ativo: boolean; turnos: TurnoAbertura[]
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function TurnoForm({ onAdd }: { onAdd: (t: TurnoAbertura) => void }) {
  const [diasSemana, setDias]           = useState<number[]>([1, 2, 3, 4, 5])
  const [horaAbertura, setHora]         = useState('08:00')
  const [toleranciaMinutos, setToler]   = useState(30)
  const [horaFechamento, setHoraFech]   = useState('')
  const [toleranciaFechamentoMinutos, setTolerFech] = useState(15)
  const [checkinFechamentoObrigatorio, setCheckin]  = useState(false)
  const [erro, setErro]                 = useState('')

  function toggleDia(d: number) {
    setDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  function handleAdd() {
    if (!diasSemana.length) { setErro('Selecione ao menos um dia.'); return }
    if (!horaAbertura) { setErro('Informe o horário de abertura.'); return }
    onAdd({
      diasSemana,
      horaAbertura,
      toleranciaMinutos,
      horaFechamento: horaFechamento || undefined,
      toleranciaFechamentoMinutos,
      checkinFechamentoObrigatorio,
    })
    setErro('')
  }

  return (
    <div className="border border-dashed border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50">
      <p className="text-sm font-medium text-gray-700">Novo turno</p>

      {/* Dias */}
      <div className="flex flex-wrap gap-1.5">
        {DIAS.map((d, i) => (
          <button key={i} type="button" onClick={() => toggleDia(i)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              diasSemana.includes(i) ? 'bg-ggtech-blue text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-ggtech-blue'
            }`}>
            {d}
          </button>
        ))}
      </div>

      {/* Abertura */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label flex items-center gap-1"><AlarmClock className="h-3 w-3 text-green-500" /> Hora de abertura</label>
          <input type="time" className="input" value={horaAbertura} onChange={e => setHora(e.target.value)} />
        </div>
        <div>
          <label className="label">Tolerância abertura (min)</label>
          <input type="number" min={0} className="input" value={toleranciaMinutos} onChange={e => setToler(Number(e.target.value))} />
        </div>
      </div>

      {/* Fechamento */}
      <div className="border-t border-gray-200 pt-3 space-y-3">
        <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
          <LogOut className="h-3 w-3 text-orange-400" /> Controle de fechamento (opcional)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Hora de fechamento</label>
            <input type="time" className="input" value={horaFechamento} onChange={e => setHoraFech(e.target.value)} />
          </div>
          <div>
            <label className="label">Tolerância fechamento (min)</label>
            <input type="number" min={0} className="input" value={toleranciaFechamentoMinutos} onChange={e => setTolerFech(Number(e.target.value))} />
          </div>
        </div>
        {horaFechamento && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="h-4 w-4 rounded accent-ggtech-blue"
              checked={checkinFechamentoObrigatorio}
              onChange={e => setCheckin(e.target.checked)} />
            <span className="text-sm text-gray-700">
              Exigir check-in de fechamento pelo operador
              <span className="block text-xs text-gray-400 mt-0.5">
                {checkinFechamentoObrigatorio
                  ? 'Alerta se operador não fizer check-in no fechamento'
                  : 'Fechamento automático no horário (sem check-in necessário)'}
              </span>
            </span>
          </label>
        )}
      </div>

      {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={handleAdd}
          className="btn-primary flex items-center gap-1.5 h-10">
          <Check className="h-3.5 w-3.5" /> Adicionar turno
        </button>
      </div>
    </div>
  )
}

export default function PontoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [ponto, setPonto]           = useState<Ponto | null>(null)
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [loading, setLoading]       = useState(true)
  const [ctrlEnabled, setCtrlEnabled] = useState(false)

  const [saving, setSaving]         = useState(false)
  const [savingCtrl, setSavingCtrl] = useState(false)
  const [activating, setActivating] = useState(false)

  const [ctrlOk, setCtrlOk]         = useState(false)
  const [activateOk, setActivateOk] = useState(false)
  const [regenerating, setRegen]    = useState(false)
  const [copied, setCopied]         = useState(false)
  const [showTurnoForm, setShowTurnoForm]   = useState(false)
  const [vinculandoId, setVinculandoId]     = useState<string | null>(null)
  const [selectedVig, setSelectedVig]       = useState('')
  const [aberturaConfig, setAberturaConfig] = useState<ConfigAberturaData>({ ativo: true, turnos: [] })
  const [savingAbertura, setSavingAbertura] = useState(false)
  const [erroAbertura, setErroAbertura]     = useState('')
  const [aberturaOk, setAberturaOk]         = useState(false)

  const [erro, setErro]         = useState('')
  const [erroCtrl, setErroCtrl] = useState('')
  const [actErro, setActErro]   = useState('')

  const [form, setForm] = useState({ nome: '', descricao: '', endereco: '', latitude: '', longitude: '' })
  const [buscandoGeo, setBuscandoGeo] = useState(false)
  const [erroGeo, setErroGeo]         = useState('')
  const [ctrlForm, setCtrlForm] = useState({
    ctrlsafeAccount: '', ctrlsafePartition: '01',
    ctrlsafeZone: '099', ctrlsafeReceiver: '001', ctrlsafeLine: '01',
    codigoCheckin: '1602', codigoPanico: '1122', codigoFalha: '1130',
  })
  const [licenseKey, setLicenseKey] = useState('')

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  useEffect(() => {
    Promise.all([
      apiFetch<Ponto>(`/pontos/${id}`),
      apiFetch<Operador[]>('/operadores').catch(() => []),
      apiFetch<{ alertarPorCtrlSafe: boolean }>('/configuracoes/notificacoes').catch(() => ({ alertarPorCtrlSafe: false })),
      apiFetch<ConfigAberturaData>(`/abertura/config/${id}`).catch(() => null),
    ]).then(([pt, vigs, notif, abertura]) => {
      const p = pt as Ponto
      setPonto(p)
      setForm({
        nome: p.nome,
        descricao: p.descricao ?? '',
        endereco: p.endereco ?? '',
        latitude: p.latitude != null ? String(p.latitude) : '',
        longitude: p.longitude != null ? String(p.longitude) : '',
      })
      setCtrlForm(f => ({
        ...f,
        ctrlsafeAccount:   p.ctrlsafeAccount   ?? '',
        ctrlsafePartition: p.ctrlsafePartition  ?? '01',
        ctrlsafeZone:      p.ctrlsafeZone       ?? '099',
        ctrlsafeReceiver:  p.ctrlsafeReceiver   ?? '001',
        ctrlsafeLine:      p.ctrlsafeLine       ?? '01',
      }))
      setLicenseKey(p.ctrlsafeLicenseKey ?? '')
      setCtrlEnabled((notif as { alertarPorCtrlSafe: boolean }).alertarPorCtrlSafe)
      setOperadores((vigs as Operador[]).filter(v => v.ativo))
      if (abertura) setAberturaConfig(abertura as ConfigAberturaData)
      setLoading(false)
    }).catch(() => { setLoading(false); setErro('Ponto não encontrado') })
  }, [id])

  async function buscarCoordenadas() {
    if (!form.endereco.trim()) return
    setBuscandoGeo(true); setErroGeo('')
    try {
      const q = encodeURIComponent(form.endereco)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'OpenCheck/1.0' },
      })
      const data = await res.json() as { lat: string; lon: string; display_name: string }[]
      if (!data.length) { setErroGeo('Endereço não encontrado. Tente ser mais específico.'); return }
      setForm(f => ({ ...f, latitude: Number(data[0].lat).toFixed(6), longitude: Number(data[0].lon).toFixed(6) }))
    } catch {
      setErroGeo('Erro ao buscar coordenadas.')
    } finally {
      setBuscandoGeo(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    try {
      await apiFetch(`/pontos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nome: form.nome,
          descricao: form.descricao,
          endereco: form.endereco,
          latitude:  form.latitude  ? Number(form.latitude)  : null,
          longitude: form.longitude ? Number(form.longitude) : null,
        }),
      })
      router.push('/pontos')
    } catch (err) {
      setErro(String(err)); setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Desativar o ponto "${ponto?.nome}"?`)) return
    await apiFetch(`/pontos/${id}`, { method: 'DELETE' })
    router.push('/pontos')
  }

  async function handleCopyKey() {
    if (!ponto?.agentKey) return
    await navigator.clipboard.writeText(ponto.agentKey).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function handleRegenerateKey() {
    if (!confirm('Regenerar a agentKey vai invalidar a chave atual. Todos os dispositivos precisarão ser reconfigurados. Continuar?')) return
    setRegen(true)
    try {
      const res = await apiFetch<{ agentKey: string; agentKeyAt: string }>(`/pontos/${id}/agentkey/regenerar`, { method: 'POST' })
      setPonto(p => p ? { ...p, agentKey: res.agentKey, agentKeyAt: res.agentKeyAt } : p)
    } finally { setRegen(false) }
  }

  async function handleSaveAbertura(e: React.FormEvent) {
    e.preventDefault()
    setSavingAbertura(true); setErroAbertura(''); setAberturaOk(false)
    try {
      const res = await apiFetch<ConfigAberturaData>(`/abertura/config/${id}`, {
        method: 'PUT',
        body: JSON.stringify(aberturaConfig),
      })
      setAberturaConfig(res as ConfigAberturaData)
      setShowTurnoForm(false)
      setAberturaOk(true); setTimeout(() => setAberturaOk(false), 4000)
    } catch (err) { setErroAbertura(String(err)) }
    finally { setSavingAbertura(false) }
  }

  function handleAddTurno(t: TurnoAbertura) {
    setAberturaConfig(c => ({ ...c, turnos: [...c.turnos, t] }))
    setShowTurnoForm(false)
  }

  function handleRemoveTurno(idx: number) {
    setAberturaConfig(c => ({ ...c, turnos: c.turnos.filter((_, i) => i !== idx) }))
  }

  async function handleVincularOperador() {
    if (!selectedVig) return
    setVinculandoId(selectedVig)
    try {
      await apiFetch(`/pontos/${id}/operadores/${selectedVig}`, { method: 'POST' })
      setOperadores(prev => prev.map(v => v.id === selectedVig
        ? { ...v, pontos: [...(v.pontos ?? []), { id, nome: ponto!.nome }] }
        : v))
      setSelectedVig('')
    } finally { setVinculandoId(null) }
  }

  async function handleDesvincularOperador(vigId: string) {
    setVinculandoId(vigId)
    try {
      await apiFetch(`/pontos/${id}/operadores/${vigId}`, { method: 'DELETE' })
      setOperadores(prev => prev.map(v => v.id === vigId
        ? { ...v, pontos: (v.pontos ?? []).filter(p => p.id !== id) }
        : v))
    } finally { setVinculandoId(null) }
  }

  async function handleActivateCtrlSafe() {
    if (!licenseKey) { setActErro('Informe a chave de licença.'); return }
    setActivating(true); setActErro(''); setActivateOk(false)
    try {
      await apiFetch(`/pontos/${id}/ctrlsafe/ativar`, { method: 'POST', body: JSON.stringify({ licenseKey }) })
      const updated = await apiFetch<Ponto>(`/pontos/${id}`)
      setPonto(updated as Ponto)
      setActivateOk(true); setTimeout(() => setActivateOk(false), 6000)
    } catch (err) { setActErro(String(err)) }
    finally { setActivating(false) }
  }

  async function handleSaveCtrl(e: React.FormEvent) {
    e.preventDefault()
    setSavingCtrl(true); setErroCtrl(''); setCtrlOk(false)
    try {
      await Promise.all([
        apiFetch(`/pontos/${id}`, { method: 'PUT', body: JSON.stringify({
          ctrlsafeAccount:   ctrlForm.ctrlsafeAccount,
          ctrlsafePartition: ctrlForm.ctrlsafePartition,
          ctrlsafeZone:      ctrlForm.ctrlsafeZone,
          ctrlsafeReceiver:  ctrlForm.ctrlsafeReceiver,
          ctrlsafeLine:      ctrlForm.ctrlsafeLine,
        }) }),
        apiFetch(`/pontos/${id}/ciclo`, { method: 'PUT', body: JSON.stringify({
          codigoCheckin: ctrlForm.codigoCheckin,
          codigoPanico:  ctrlForm.codigoPanico,
          codigoFalha:   ctrlForm.codigoFalha,
        }) }),
      ])
      setCtrlOk(true); setTimeout(() => setCtrlOk(false), 4000)
    } catch (err) { setErroCtrl(String(err)) }
    finally { setSavingCtrl(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  if (!ponto) return (
    <div className="card text-center py-16 text-gray-400"><p>Ponto não encontrado.</p></div>
  )

  const ctrlAtivo = !!ponto.ctrlsafeAgentToken

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/pontos')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900 flex items-center gap-2">
            <MapPin className="h-6 w-6 text-ggtech-blue" /> {ponto.nome}
          </h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ponto.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {ponto.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </div>

      {/* Dados do ponto */}
      <div className="card">
        <h2 className="font-heading font-semibold text-gray-800 mb-4">Dados do ponto</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Nome *</label>
              <input className="input" required value={form.nome} onChange={e => set('nome', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Endereço</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Rua, número, cidade, estado"
                  value={form.endereco}
                  onChange={e => set('endereco', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarCoordenadas())}
                />
                <button
                  type="button"
                  onClick={buscarCoordenadas}
                  disabled={buscandoGeo || !form.endereco.trim()}
                  className="btn-primary flex items-center gap-1.5 px-3 text-sm flex-shrink-0 disabled:opacity-50"
                >
                  {buscandoGeo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                  {buscandoGeo ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
              {erroGeo && <p className="text-xs text-red-500 mt-1">{erroGeo}</p>}
            </div>
            <div>
              <label className="label">Latitude</label>
              <input type="number" step="any" className="input" placeholder="-23.5505" value={form.latitude} onChange={e => set('latitude', e.target.value)} />
            </div>
            <div>
              <label className="label">Longitude</label>
              <input type="number" step="any" className="input" placeholder="-46.6333" value={form.longitude} onChange={e => set('longitude', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Descrição</label>
              <textarea className="input" rows={3} value={form.descricao} onChange={e => set('descricao', e.target.value)} />
            </div>
          </div>
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium">
              <Trash2 className="h-4 w-4" /> Desativar
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 ml-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>

      {/* agentKey */}
      <div className="card">
        <h2 className="font-heading font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Key className="h-5 w-5 text-ggtech-blue" /> Chave de campo (agentKey)
        </h2>
        <p className="text-xs text-gray-500 mb-3">Use esta chave no app desktop para autenticar as requisições de check-in de abertura.</p>
        {ponto.agentKey ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 truncate">
              {ponto.agentKey}
            </code>
            <button onClick={handleCopyKey} title="Copiar"
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-ggtech-blue transition-colors flex-shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
            <button onClick={handleRegenerateKey} disabled={regenerating} title="Regenerar chave"
              className="p-2 rounded-lg border border-gray-200 hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors flex-shrink-0">
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Nenhuma chave gerada.</p>
        )}
        {ponto.agentKeyAt && (
          <p className="text-xs text-gray-400 mt-2">
            Gerada em {new Date(ponto.agentKeyAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Controle de Abertura e Fechamento */}
      <form onSubmit={handleSaveAbertura} className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-gray-800 flex items-center gap-2">
            <AlarmClock className="h-5 w-5 text-ggtech-blue" /> Controle de Abertura e Fechamento
          </h2>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="h-4 w-4 rounded accent-ggtech-blue"
              checked={aberturaConfig.ativo}
              onChange={e => setAberturaConfig(c => ({ ...c, ativo: e.target.checked }))} />
            <span className="text-sm text-gray-700">Ativo</span>
          </label>
        </div>

        <div>
          <label className="label flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> E-mail de alerta (opcional)</label>
          <input type="email" className="input" placeholder="alertas@empresa.com.br"
            value={aberturaConfig.emailAlerta ?? ''}
            onChange={e => setAberturaConfig(c => ({ ...c, emailAlerta: e.target.value || undefined }))} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Turnos</p>
            <button type="button" onClick={() => setShowTurnoForm(v => !v)}
              className="btn-ghost flex items-center gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Adicionar turno
            </button>
          </div>

          {showTurnoForm && <TurnoForm onAdd={handleAddTurno} />}

          {aberturaConfig.turnos.length === 0 && !showTurnoForm ? (
            <p className="text-sm text-gray-400">Nenhum turno configurado.</p>
          ) : (
            <div className="space-y-2">
              {aberturaConfig.turnos.map((t, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-gray-200 bg-white space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 flex-1">
                      {/* Dias */}
                      <div className="flex gap-1 flex-wrap">
                        {DIAS.map((d, i) => (
                          <span key={i} className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            (t.diasSemana.length === 0 || t.diasSemana.includes(i))
                              ? 'bg-ggtech-blue/10 text-ggtech-blue'
                              : 'text-gray-300'
                          }`}>{d}</span>
                        ))}
                      </div>
                      {/* Abertura */}
                      <div className="flex items-center gap-2 text-sm">
                        <AlarmClock className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        <span className="font-medium text-gray-700">Abertura:</span>
                        <span className="text-gray-600">{t.horaAbertura}</span>
                        <span className="text-gray-400 text-xs">· tolerância {t.toleranciaMinutos} min</span>
                      </div>
                      {/* Fechamento */}
                      {t.horaFechamento ? (
                        <div className="flex items-center gap-2 text-sm">
                          <LogOut className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                          <span className="font-medium text-gray-700">Fechamento:</span>
                          <span className="text-gray-600">{t.horaFechamento}</span>
                          <span className="text-gray-400 text-xs">· tolerância {t.toleranciaFechamentoMinutos} min</span>
                          {t.checkinFechamentoObrigatorio
                            ? <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">check-in obrigatório</span>
                            : <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">auto-fechamento</span>
                          }
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">Sem controle de fechamento</div>
                      )}
                    </div>
                    <button type="button" onClick={() => handleRemoveTurno(idx)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {erroAbertura && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erroAbertura}</div>}
        {aberturaOk && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Configuração salva!
          </div>
        )}
        <div className="flex justify-end">
          <button type="submit" disabled={savingAbertura} className="btn-primary flex items-center gap-2">
            {savingAbertura ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingAbertura ? 'Salvando...' : 'Salvar turnos'}
          </button>
        </div>
      </form>

      {/* CTRL+SAFE */}
      {ctrlEnabled && (
        <div className="card space-y-5">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Shield className="h-5 w-5 text-ggtech-blue" />
            <h2 className="font-heading font-semibold text-gray-800">Monitoramento</h2>
            {ctrlAtivo
              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Licença ativa</span>
              : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Não ativado</span>}
          </div>

          <div className="space-y-3">
            <label className="label flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Chave de licença</label>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-sm" placeholder="LIC-XXXXXXXXXXXXXXXX"
                value={licenseKey} onChange={e => setLicenseKey(e.target.value)} />
              <button type="button" onClick={handleActivateCtrlSafe} disabled={activating || !licenseKey}
                className="btn-primary flex items-center gap-1.5 px-4 text-sm whitespace-nowrap flex-shrink-0">
                {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                {activating ? 'Ativando...' : ctrlAtivo ? 'Reativar' : 'Ativar'}
              </button>
            </div>
            {activateOk && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Licença ativada!
              </div>
            )}
            {actErro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{actErro}</div>}
            {ponto.ctrlsafeAgentToken && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-gray-500">Agent Token</p>
                <p className="text-xs font-mono text-gray-600 truncate">{ponto.ctrlsafeAgentToken.slice(0, 20)}…</p>
                {ponto.ctrlsafeInstallId && (
                  <p className="text-xs text-gray-400">Install ID: {ponto.ctrlsafeInstallId.slice(0, 18)}…</p>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSaveCtrl} className="space-y-4 pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-600">Contact ID</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label className="label">Conta (Account) *</label>
                <input className="input font-mono" placeholder="0001" value={ctrlForm.ctrlsafeAccount}
                  onChange={e => setCtrlForm(f => ({ ...f, ctrlsafeAccount: e.target.value }))} />
              </div>
              <div><label className="label">Partição</label>
                <input className="input font-mono" placeholder="01" value={ctrlForm.ctrlsafePartition}
                  onChange={e => setCtrlForm(f => ({ ...f, ctrlsafePartition: e.target.value }))} /></div>
              <div><label className="label">Zona</label>
                <input className="input font-mono" placeholder="099" value={ctrlForm.ctrlsafeZone}
                  onChange={e => setCtrlForm(f => ({ ...f, ctrlsafeZone: e.target.value }))} /></div>
              <div><label className="label">Receptor</label>
                <input className="input font-mono" placeholder="001" value={ctrlForm.ctrlsafeReceiver}
                  onChange={e => setCtrlForm(f => ({ ...f, ctrlsafeReceiver: e.target.value }))} /></div>
              <div><label className="label">Linha</label>
                <input className="input font-mono" placeholder="01" value={ctrlForm.ctrlsafeLine}
                  onChange={e => setCtrlForm(f => ({ ...f, ctrlsafeLine: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
              <div><label className="label">Cód. Check-in</label>
                <input className="input font-mono" value={ctrlForm.codigoCheckin}
                  onChange={e => setCtrlForm(f => ({ ...f, codigoCheckin: e.target.value }))} /></div>
              <div><label className="label">Cód. Pânico</label>
                <input className="input font-mono" value={ctrlForm.codigoPanico}
                  onChange={e => setCtrlForm(f => ({ ...f, codigoPanico: e.target.value }))} /></div>
              <div><label className="label">Cód. Falha</label>
                <input className="input font-mono" value={ctrlForm.codigoFalha}
                  onChange={e => setCtrlForm(f => ({ ...f, codigoFalha: e.target.value }))} /></div>
            </div>
            {erroCtrl && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erroCtrl}</div>}
            {ctrlOk && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                <Check className="h-4 w-4" /> Contact ID salvo!
              </div>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={savingCtrl} className="btn-primary flex items-center gap-2">
                {savingCtrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingCtrl ? 'Salvando...' : 'Salvar Contact ID'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Operadores */}
      <div className="card">
        <h2 className="font-heading font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-ggtech-blue" /> Operadores vinculados
        </h2>
        {(() => {
          const vinculados = operadores.filter(v => v.pontos?.some(p => p.id === id))
          const disponiveis = operadores.filter(v => !v.pontos?.some(p => p.id === id))
          return (
            <>
              {vinculados.length === 0 ? (
                <p className="text-sm text-gray-400 mb-3">Nenhum operador vinculado a este ponto.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {vinculados.map(v => (
                    <div key={v.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="h-8 w-8 rounded-full bg-ggtech-blue/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-ggtech-blue font-bold text-xs">{v.nome[0]}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-800 flex-1">{v.nome}</span>
                      {v.codigo && (
                        <code className="text-xs font-mono text-ggtech-blue bg-ggtech-blue/5 px-2 py-0.5 rounded">{v.codigo}</code>
                      )}
                      <button onClick={() => handleDesvincularOperador(v.id)} disabled={vinculandoId === v.id}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                        {vinculandoId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {disponiveis.length > 0 && (
                <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                  <select className="input flex-1 text-sm" value={selectedVig} onChange={e => setSelectedVig(e.target.value)}>
                    <option value="">Selecionar operador...</option>
                    {disponiveis.map(v => (
                      <option key={v.id} value={v.id}>{v.nome}{v.codigo ? ` — ${v.codigo}` : ''}</option>
                    ))}
                  </select>
                  <button onClick={handleVincularOperador} disabled={!selectedVig || !!vinculandoId}
                    className="btn-primary flex items-center gap-1.5 px-3 text-sm flex-shrink-0">
                    {vinculandoId && selectedVig === vinculandoId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Vincular
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </div>

    </div>
  )
}
