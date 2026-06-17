'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Building2, Users, MapPin, CreditCard, CheckCircle, AlertCircle, Clock, XCircle, Camera } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL

interface Tenant {
  id: string; nome: string; email: string; cnpj?: string; telefone?: string; ativo: boolean; criadoEm: string
  camerasHabilitadas: boolean
  assinatura?: {
    status: string; periodicidade: string; pontosContratados: number; trialAteEm?: string; proximaCobrancaEm?: string
    plano: { nome: string; valorMensal: number }
  }
  onboarding?: { concluido: boolean }
}

interface Cobranca { id: string; valor: number; status: string; vencimentoEm: string }

const STATUS_MAP: Record<string, { label: string; Icon: React.ElementType; cls: string }> = {
  TRIAL:        { label: 'Trial',        Icon: Clock,         cls: 'bg-indigo-100 text-indigo-700' },
  ATIVA:        { label: 'Ativa',        Icon: CheckCircle,   cls: 'bg-green-100 text-green-700' },
  INADIMPLENTE: { label: 'Inadimplente', Icon: AlertCircle,   cls: 'bg-yellow-100 text-yellow-700' },
  SUSPENSA:     { label: 'Suspensa',     Icon: XCircle,       cls: 'bg-red-100 text-red-700' },
  CANCELADA:    { label: 'Cancelada',    Icon: XCircle,       cls: 'bg-gray-100 text-gray-600' },
}

function auth() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` }
}

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [tenant, setTenant]       = useState<Tenant | null>(null)
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'geral' | 'assinatura' | 'cobrancas'>('geral')

  useEffect(() => {
    Promise.all([
      fetch(`${API}/superadmin/clientes/${id}`, { headers: auth() }).then(r => r.json()),
      fetch(`${API}/superadmin/clientes/${id}/assinatura/cobrancas`, { headers: auth() }).then(r => r.json()).catch(() => []),
    ]).then(([t, cob]) => {
      setTenant(t)
      setCobrancas(Array.isArray(cob) ? cob : [])
      setLoading(false)
    })
  }, [id])

  async function toggleAtivo() {
    if (!tenant) return
    await fetch(`${API}/superadmin/clientes/${id}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !tenant.ativo }),
    })
    setTenant(t => t ? { ...t, ativo: !t.ativo } : t)
  }

  async function toggleCameras() {
    if (!tenant) return
    await fetch(`${API}/superadmin/clientes/${id}`, {
      method: 'PUT',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ camerasHabilitadas: !tenant.camerasHabilitadas }),
    })
    setTenant(t => t ? { ...t, camerasHabilitadas: !t.camerasHabilitadas } : t)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  if (!tenant) return (
    <div className="card text-center py-16 text-gray-400">Cliente não encontrado.</div>
  )

  const ass = tenant.assinatura
  const st  = ass ? (STATUS_MAP[ass.status] ?? STATUS_MAP.CANCELADA) : null

  const TABS = [
    { key: 'geral',       label: 'Geral' },
    { key: 'assinatura',  label: 'Assinatura' },
    { key: 'cobrancas',   label: 'Cobranças' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/clientes')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-2xl text-gray-900">{tenant.nome}</h1>
          <p className="text-sm text-gray-500">{tenant.email}</p>
        </div>
        <button
          onClick={toggleAtivo}
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${tenant.ativo ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
        >
          {tenant.ativo ? 'Desativar cliente' : 'Reativar cliente'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-ggtech-blue text-ggtech-blue' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Geral */}
      {tab === 'geral' && (
        <div className="card space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Razão social</p>
                <p className="font-medium text-gray-800">{tenant.nome}</p>
              </div>
            </div>
            {tenant.cnpj && (
              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-gray-500 text-xs">CNPJ</p>
                  <p className="font-medium text-gray-800">{tenant.cnpj}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Users className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">E-mail</p>
                <p className="font-medium text-gray-800">{tenant.email}</p>
              </div>
            </div>
            {tenant.telefone && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-gray-500 text-xs">Telefone</p>
                  <p className="font-medium text-gray-800">{tenant.telefone}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Cliente desde</p>
                <p className="font-medium text-gray-800">{new Date(tenant.criadoEm).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Status</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${tenant.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {tenant.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Funcionalidades</p>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <Camera className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Câmeras (EZVIZ)</p>
                  <p className="text-xs text-gray-400">Vinculação de câmeras, aba Câmeras e integração EZVIZ</p>
                </div>
              </div>
              <button
                onClick={toggleCameras}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tenant.camerasHabilitadas ? 'bg-ggtech-blue' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${tenant.camerasHabilitadas ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Assinatura */}
      {tab === 'assinatura' && (
        <div className="card space-y-4">
          {!ass || !st ? (
            <div className="text-center py-8 text-gray-400">
              <CreditCard className="h-10 w-10 mx-auto text-gray-200 mb-2" />
              <p>Sem assinatura ativa.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{ass.plano.nome}</h3>
                  <p className="text-gray-500 text-sm">R$ {Number(ass.plano.valorMensal).toFixed(2)}/mês · {ass.pontosContratados} pontos</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${st.cls}`}>
                  <st.Icon className="h-3.5 w-3.5" /> {st.label}
                </span>
              </div>
              <div className="border-t pt-4 flex flex-wrap gap-6 text-sm text-gray-600">
                {ass.trialAteEm && (
                  <div><span className="text-gray-400">Trial até: </span><strong>{new Date(ass.trialAteEm).toLocaleDateString('pt-BR')}</strong></div>
                )}
                {ass.proximaCobrancaEm && (
                  <div><span className="text-gray-400">Próxima cobrança: </span><strong>{new Date(ass.proximaCobrancaEm).toLocaleDateString('pt-BR')}</strong></div>
                )}
                <div><span className="text-gray-400">Periodicidade: </span><strong>{ass.periodicidade}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Cobranças */}
      {tab === 'cobrancas' && (
        <div className="card">
          {cobrancas.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Nenhuma cobrança registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    {['Vencimento', 'Valor', 'Status'].map(h => (
                      <th key={h} className="pb-3 pr-6 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cobrancas.map(c => (
                    <tr key={c.id} className="text-gray-700">
                      <td className="py-3 pr-6">{new Date(c.vencimentoEm).toLocaleDateString('pt-BR')}</td>
                      <td className="pr-6">R$ {Number(c.valor).toFixed(2)}</td>
                      <td>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          c.status === 'CONFIRMADA' || c.status === 'RECEBIDA' ? 'bg-green-100 text-green-700' :
                          c.status === 'VENCIDA' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{c.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
