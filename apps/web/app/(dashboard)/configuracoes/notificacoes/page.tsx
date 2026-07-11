'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api'
import {
  ArrowLeft, Bell, CheckCircle2, Loader2, RefreshCw, Save,
  Send, Shield, Smartphone, Users, Wifi, WifiOff, AlertCircle, QrCode,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

// ─── tipos ────────────────────────────────────────────────────────────────────

type InstStatus = 'SEM_INSTANCIA' | 'DESCONECTADO' | 'AGUARDANDO_QR' | 'CONECTADO'

interface WppStatus {
  status: InstStatus
  grupoJid?: string | null
  grupoNome?: string | null
  destino?: string | null
}

interface Grupo {
  id: string
  nome: string
}

interface WppConfig {
  ativo: boolean
  whatsappDestino: string
  whatsappEventos: string[]
  whatsappGrupoJid: string | null
  whatsappGrupoNome: string | null
}

interface CtrlConfig {
  alertarPorCtrlSafe: boolean
}

// ─── constantes ───────────────────────────────────────────────────────────────

const EVENTOS_DISPONIVEIS = [
  { value: 'CHECKIN',           label: '✅ Check-in' },
  { value: 'ABERTURA_AUSENTE',  label: '🔔 Sem Abertura' },
  { value: 'FECHAMENTO_AUSENTE',label: '🔔 Sem Fechamento' },
  { value: 'PANICO',            label: '🚨 Pânico' },
  { value: 'PANICO_SILENCIOSO', label: '🚨 Pânico Silencioso' },
  { value: 'COACAO',            label: '⚠️ Coação' },
  { value: 'ALERTA',            label: '🔔 Alerta — Sem Check-in' },
]

// ─── componente principal ─────────────────────────────────────────────────────

export default function NotificacoesPage() {
  // WhatsApp — conexão (instância Z-API vinculada pelo administrador)
  const [instStatus,   setInstStatus]   = useState<InstStatus>('SEM_INSTANCIA')
  const [qrCode,       setQrCode]       = useState<string | null>(null)
  const [conectando,   setConectando]   = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // WhatsApp — grupos
  const [grupos,        setGrupos]        = useState<Grupo[]>([])
  const [loadingGrupos, setLoadingGrupos] = useState(false)
  const [grupoJid,      setGrupoJid]      = useState<string>('')
  const [grupoNome,     setGrupoNome]     = useState<string>('')
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)

  // WhatsApp — config de envio
  const [wppConfig, setWppConfig] = useState<WppConfig>({
    ativo: false,
    whatsappDestino: '',
    whatsappEventos: [],
    whatsappGrupoJid: null,
    whatsappGrupoNome: null,
  })

  // CTRL+SAFE
  const [ctrlConfig,    setCtrlConfig]    = useState<CtrlConfig>({ alertarPorCtrlSafe: false })
  const [savingCtrl,    setSavingCtrl]    = useState(false)
  const [okCtrl,        setOkCtrl]        = useState(false)

  // UI state
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [testing,   setTesting]   = useState(false)
  const [ok,        setOk]        = useState(false)
  const [testOk,    setTestOk]    = useState(false)
  const [erro,      setErro]      = useState('')
  const [testErro,  setTestErro]  = useState('')

  // ── carregar config inicial ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [configs, statusRes] = await Promise.all([
          apiFetch<Array<{ tipo: string; ativo: boolean; whatsappDestino?: string; whatsappEventos?: string[]; whatsappGrupoJid?: string; whatsappGrupoNome?: string }>>('/config/notificacoes'),
          apiFetch<WppStatus>('/config/notificacoes/whatsapp/status'),
        ])

        const wpp  = configs.find(c => c.tipo === 'WHATSAPP')
        const ctrl = configs.find(c => c.tipo === 'CTRLSAFE')

        setWppConfig({
          ativo:            wpp?.ativo            ?? false,
          whatsappDestino:  wpp?.whatsappDestino  ?? '',
          whatsappEventos:  wpp?.whatsappEventos  ?? [],
          whatsappGrupoJid: wpp?.whatsappGrupoJid ?? null,
          whatsappGrupoNome:wpp?.whatsappGrupoNome ?? null,
        })
        setCtrlConfig({ alertarPorCtrlSafe: ctrl?.ativo ?? false })

        setInstStatus(statusRes.status)
        if (statusRes.grupoJid) {
          setGrupoJid(statusRes.grupoJid)
          setGrupoNome(statusRes.grupoNome ?? '')
        }
        if (statusRes.status === 'CONECTADO') carregarGrupos()
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => pararPolling()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── polling de status enquanto aguarda o QR ser lido ─────────────────────────
  const iniciarPolling = useCallback(() => {
    pararPolling()
    pollingRef.current = setInterval(async () => {
      try {
        const res = await apiFetch<WppStatus>('/config/notificacoes/whatsapp/status')
        setInstStatus(res.status)
        if (res.status === 'CONECTADO') {
          pararPolling()
          setQrCode(null)
          if (res.grupoJid) { setGrupoJid(res.grupoJid); setGrupoNome(res.grupoNome ?? '') }
          carregarGrupos()
        } else if (res.status === 'AGUARDANDO_QR') {
          // QR expira — atualiza periodicamente
          buscarQR()
        }
      } catch { /* ignora erros de polling */ }
    }, 5000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function pararPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }

  // ── ler QR code ──────────────────────────────────────────────────────────────
  async function buscarQR() {
    try {
      const res = await apiFetch<{ status: InstStatus; qrCode: string | null }>('/config/notificacoes/whatsapp/qr')
      if (res.status === 'CONECTADO') {
        setInstStatus('CONECTADO')
        setQrCode(null)
        pararPolling()
        carregarGrupos()
        return
      }
      setQrCode(res.qrCode)
      if (res.qrCode) setInstStatus('AGUARDANDO_QR')
    } catch { /* QR ainda não disponível */ }
  }

  async function conectar() {
    setConectando(true); setErro('')
    try {
      await buscarQR()
      iniciarPolling()
    } catch (err) {
      setErro(String(err))
    } finally {
      setConectando(false)
    }
  }

  // ── grupos ───────────────────────────────────────────────────────────────────
  async function carregarGrupos(tentativas = 2) {
    setLoadingGrupos(true)
    try {
      for (let i = 0; i < tentativas; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 3000))
        const lista = await apiFetch<Grupo[]>('/config/notificacoes/whatsapp/grupos')
        if (!Array.isArray(lista)) continue
        if (lista.length > 0 || i === tentativas - 1) { setGrupos(lista); return }
      }
    } catch (err) {
      setErro(String(err))
    } finally {
      setLoadingGrupos(false)
    }
  }

  function recarregarGrupos() { carregarGrupos() }

  async function salvarGrupo() {
    if (!grupoJid) return
    setSalvandoGrupo(true)
    try {
      await apiFetch('/config/notificacoes/whatsapp/grupo', {
        method: 'PUT',
        body: JSON.stringify({ grupoJid, grupoNome }),
      })
      setWppConfig(c => ({ ...c, whatsappGrupoJid: grupoJid, whatsappGrupoNome: grupoNome }))
    } catch (err) {
      setErro(String(err))
    } finally {
      setSalvandoGrupo(false)
    }
  }

  async function removerGrupo() {
    try {
      await apiFetch('/config/notificacoes/whatsapp/grupo', { method: 'DELETE' })
      setGrupoJid('')
      setGrupoNome('')
      setWppConfig(c => ({ ...c, whatsappGrupoJid: null, whatsappGrupoNome: null }))
    } catch (err) {
      setErro(String(err))
    }
  }

  // ── salvar Monitoramento (CTRL+SAFE) ────────────────────────────────────────
  async function salvarCtrlSafe() {
    setSavingCtrl(true); setErro(''); setOkCtrl(false)
    try {
      await apiFetch('/config/notificacoes/ctrlsafe', {
        method: 'PUT',
        body: JSON.stringify({ ativo: ctrlConfig.alertarPorCtrlSafe }),
      })
      setOkCtrl(true)
      setTimeout(() => setOkCtrl(false), 3000)
    } catch (err) {
      setErro(String(err))
    } finally {
      setSavingCtrl(false)
    }
  }

  // ── salvar config de envio ───────────────────────────────────────────────────
  async function salvarConfig(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro(''); setOk(false)
    try {
      await apiFetch('/config/notificacoes/whatsapp', {
        method: 'PUT',
        body: JSON.stringify({
          ativo:           wppConfig.ativo,
          whatsappDestino: wppConfig.whatsappDestino || undefined,
          whatsappEventos: wppConfig.whatsappEventos,
        }),
      })
      setOk(true)
    } catch (err) {
      setErro(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function testarWpp() {
    setTesting(true); setTestErro(''); setTestOk(false)
    try {
      await apiFetch('/configuracoes/notificacoes/testar-whatsapp', { method: 'POST' })
      setTestOk(true); setTimeout(() => setTestOk(false), 5000)
    } catch (err) {
      setTestErro(String(err))
    } finally {
      setTesting(false)
    }
  }

  function toggleEvento(value: string) {
    const atual = wppConfig.whatsappEventos
    const novo  = atual.includes(value) ? atual.filter(e => e !== value) : [...atual, value]
    setWppConfig(c => ({ ...c, whatsappEventos: novo }))
    setOk(false)
  }

  // ── render ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  return (
    <div className="max-w-xl space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Link href="/configuracoes" className="btn-ghost p-2 rounded-lg">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Notificações</h1>
          <p className="text-gray-500 text-sm">Canais de alerta para vigilância</p>
        </div>
      </div>

      {/* ── Seção WhatsApp ── */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-green-600" />
            <h2 className="font-heading font-semibold text-gray-800">WhatsApp</h2>
          </div>
          <StatusBadge status={instStatus} />
        </div>

        {/* Instância não vinculada — quem vincula é o admin da plataforma */}
        {instStatus === 'SEM_INSTANCIA' && (
          <div className="flex items-start gap-2 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <span>
              A instância de WhatsApp da sua empresa ainda não foi vinculada.
              Entre em contato com o <strong>administrador da plataforma</strong> para ativar o serviço.
            </span>
          </div>
        )}

        {/* Instância vinculada, aparelho não conectado */}
        {instStatus === 'DESCONECTADO' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Instância pronta. Conecte o WhatsApp da sua empresa lendo o QR code.
            </p>
            <button
              type="button"
              onClick={conectar}
              disabled={conectando}
              className="btn-primary flex items-center gap-2 py-2 px-4 text-sm"
            >
              {conectando ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              {conectando ? 'Gerando QR...' : 'Ler QR Code'}
            </button>
          </div>
        )}

        {/* Aguardando leitura do QR */}
        {instStatus === 'AGUARDANDO_QR' && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <span>Abra o WhatsApp no celular → <strong>Dispositivos Vinculados → Vincular dispositivo</strong> e escaneie o QR code abaixo.</span>
            </div>

            {qrCode ? (
              <div className="flex flex-col items-center gap-3">
                <div className="border-4 border-green-500 rounded-xl p-2 bg-white">
                  <Image src={qrCode} alt="QR Code WhatsApp" width={220} height={220} unoptimized />
                </div>
                <p className="text-xs text-gray-400 animate-pulse">Aguardando leitura do QR...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-green-500" />
                <p className="text-sm text-gray-500">Gerando QR code...</p>
              </div>
            )}

            <button type="button" onClick={buscarQR} className="btn-outline flex items-center gap-1.5 text-sm py-1.5 px-3">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar QR
            </button>
          </div>
        )}

        {/* Conectado — escolher grupo */}
        {instStatus === 'CONECTADO' && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Grupo para alertas
                </label>
                <button type="button" onClick={recarregarGrupos} disabled={loadingGrupos}
                  className="text-xs text-ggtech-blue hover:underline flex items-center gap-1">
                  {loadingGrupos ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Recarregar lista
                </button>
              </div>

              {grupos.length === 0 && !loadingGrupos && (
                <p className="text-xs text-gray-400 mb-2">
                  Nenhum grupo encontrado. Certifique-se que o número está em pelo menos um grupo.
                </p>
              )}

              <select
                className="input"
                value={grupoJid}
                onChange={e => {
                  const g = grupos.find(g => g.id === e.target.value)
                  setGrupoJid(e.target.value)
                  setGrupoNome(g?.nome ?? '')
                }}
              >
                <option value="">Selecione um grupo...</option>
                {grupos.map(g => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>

              {wppConfig.whatsappGrupoJid && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Grupo vinculado: <strong>{wppConfig.whatsappGrupoNome ?? wppConfig.whatsappGrupoJid}</strong>
                </p>
              )}

              <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={salvarGrupo}
                  disabled={!grupoJid || salvandoGrupo}
                  className="btn-outline flex items-center gap-1.5 text-sm py-1.5 px-3">
                  {salvandoGrupo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Vincular grupo
                </button>
                {wppConfig.whatsappGrupoJid && (
                  <button type="button" onClick={removerGrupo}
                    className="text-xs text-red-500 hover:underline">
                    Remover grupo
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Config de envio (visível quando conectado) ── */}
      {instStatus === 'CONECTADO' && (
        <form onSubmit={salvarConfig} className="card space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <h3 className="font-heading font-semibold text-gray-800 flex items-center gap-2">
              <Bell className="h-4 w-4 text-green-600" /> Configurações de Envio
            </h3>
            <button type="button" onClick={() => setWppConfig(c => ({ ...c, ativo: !c.ativo }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${wppConfig.ativo ? 'bg-green-500' : 'bg-gray-200'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${wppConfig.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {wppConfig.ativo && (
            <div className="space-y-4">
              {/* Número individual */}
              <div>
                <label className="label flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" /> Número individual (opcional)
                </label>
                <input
                  className="input"
                  placeholder="5511999999999"
                  value={wppConfig.whatsappDestino}
                  onChange={e => { setWppConfig(c => ({ ...c, whatsappDestino: e.target.value })); setOk(false) }}
                />
                <p className="text-xs text-gray-400 mt-1">Receberá alertas individualmente além do grupo. Ex: 5511999999999</p>
              </div>

              {/* Eventos */}
              <div>
                <label className="label mb-2 block">Eventos que disparam notificação</label>
                <p className="text-xs text-gray-400 mb-3">
                  Notificação enviada para o grupo{wppConfig.whatsappGrupoNome ? ` "${wppConfig.whatsappGrupoNome}"` : ''} e para o número individual (se configurado).
                </p>
                <div className="space-y-2">
                  {EVENTOS_DISPONIVEIS.map(ev => (
                    <label key={ev.value} className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        checked={wppConfig.whatsappEventos.includes(ev.value)}
                        onChange={() => toggleEvento(ev.value)}
                      />
                      <span className="text-sm text-gray-700">{ev.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Testar */}
              <div className="flex items-center gap-3">
                <button type="button" onClick={testarWpp}
                  disabled={testing || (!wppConfig.whatsappDestino && !wppConfig.whatsappGrupoJid)}
                  className="btn-outline flex items-center gap-2 py-2 px-4 text-sm">
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Testar envio
                </button>
                {testOk && (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" /> Enviado!
                  </span>
                )}
              </div>
              {testErro && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{testErro}</div>
              )}
            </div>
          )}

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
          {ok   && <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">Configurações salvas!</div>}

          <button type="submit" disabled={saving}
            className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </form>
      )}

      {/* Erro global */}
      {erro && instStatus !== 'CONECTADO' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {/* ── CTRL+SAFE ── */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-ggtech-blue" />
            <h2 className="font-heading font-semibold text-gray-800">Monitoramento</h2>
          </div>
          <button
            type="button"
            onClick={() => setCtrlConfig(c => ({ ...c, alertarPorCtrlSafe: !c.alertarPorCtrlSafe }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ctrlConfig.alertarPorCtrlSafe ? 'bg-ggtech-blue' : 'bg-gray-200'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ctrlConfig.alertarPorCtrlSafe ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {ctrlConfig.alertarPorCtrlSafe && (
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
            <span>A licença CTRL+SAFE é ativada individualmente por ponto. Acesse <strong>Pontos → [ponto] → CTRL+SAFE</strong> para inserir a chave e ativar cada ponto.</span>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={salvarCtrlSafe}
            disabled={savingCtrl}
            className="btn-primary flex items-center gap-2 py-2 px-4 text-sm"
          >
            {savingCtrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingCtrl ? 'Salvando...' : 'Salvar Monitoramento'}
          </button>
          {okCtrl && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Salvo!
            </span>
          )}
        </div>
      </div>

    </div>
  )
}

// ─── sub-componente StatusBadge ───────────────────────────────────────────────

function StatusBadge({ status }: { status: InstStatus }) {
  const map: Record<InstStatus, { label: string; cls: string; Icon: React.ElementType }> = {
    SEM_INSTANCIA: { label: 'Não vinculado',   cls: 'bg-gray-100 text-gray-500',              Icon: WifiOff },
    DESCONECTADO:  { label: 'Desconectado',    cls: 'bg-red-100 text-red-600',                Icon: WifiOff },
    AGUARDANDO_QR: { label: 'Aguardando QR',   cls: 'bg-yellow-100 text-yellow-700 animate-pulse', Icon: Loader2 },
    CONECTADO:     { label: 'Conectado',        cls: 'bg-green-100 text-green-700',            Icon: Wifi },
  }
  const { label, cls, Icon } = map[status]
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
