'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Building2, Users, MapPin, CreditCard, CheckCircle, AlertCircle, Clock, XCircle,
  Plus, X, Save, Loader2, KeyRound, Power, User,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL

interface Tenant {
  id: string; nome: string; email: string; cnpj?: string; telefone?: string; ativo: boolean; criadoEm: string
  assinatura?: {
    status: string; periodicidade: string; pontosContratados: number; trialAteEm?: string; proximaCobrancaEm?: string
    plano: { nome: string; valorMensal: number }
  }
  onboarding?: { concluido: boolean }
}

interface Cobranca { id: string; valor: number; status: string; vencimentoEm: string }

interface UsuarioTenant {
  id: string; nome: string; email: string
  papel: 'SUPERADMIN' | 'ADMIN' | 'OPERADOR'
  ativo: boolean; criadoEm: string
}

const STATUS_MAP: Record<string, { label: string; Icon: React.ElementType; cls: string }> = {
  TRIAL:        { label: 'Trial',        Icon: Clock,         cls: 'bg-indigo-100 text-indigo-700' },
  ATIVA:        { label: 'Ativa',        Icon: CheckCircle,   cls: 'bg-green-100 text-green-700' },
  INADIMPLENTE: { label: 'Inadimplente', Icon: AlertCircle,   cls: 'bg-yellow-100 text-yellow-700' },
  SUSPENSA:     { label: 'Suspensa',     Icon: XCircle,       cls: 'bg-red-100 text-red-700' },
  CANCELADA:    { label: 'Cancelada',    Icon: XCircle,       cls: 'bg-gray-100 text-gray-600' },
}

const PAPEL_LABEL: Record<string, string> = {
  SUPERADMIN: 'Superadmin', ADMIN: 'Admin', OPERADOR: 'Operador',
}

function auth() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` }
}

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [tenant, setTenant]       = useState<Tenant | null>(null)
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([])
  const [usuarios, setUsuarios]   = useState<UsuarioTenant[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'geral' | 'usuarios' | 'assinatura' | 'cobrancas'>('geral')

  // Usuários — estado de gestão
  const [modalUsuario, setModalUsuario] = useState(false)
  const [formUsuario, setFormUsuario]   = useState({ nome: '', email: '', senha: '', papel: 'OPERADOR' as 'ADMIN' | 'OPERADOR' })
  const [salvandoUsuario, setSalvandoUsuario] = useState(false)
  const [erroUsuario, setErroUsuario]   = useState('')
  const [acaoUsuario, setAcaoUsuario]   = useState<string | null>(null)
  const [resetando, setResetando]       = useState<UsuarioTenant | null>(null)
  const [novaSenha, setNovaSenha]       = useState('')

  const loadUsuarios = useCallback(async () => {
    const data = await fetch(`${API}/superadmin/clientes/${id}/usuarios`, { headers: auth() })
      .then(r => r.json()).catch(() => [])
    setUsuarios(Array.isArray(data) ? data : [])
  }, [id])

  useEffect(() => {
    Promise.all([
      fetch(`${API}/superadmin/clientes/${id}`, { headers: auth() }).then(r => r.json()),
      fetch(`${API}/superadmin/clientes/${id}/assinatura/cobrancas`, { headers: auth() }).then(r => r.json()).catch(() => []),
      fetch(`${API}/superadmin/clientes/${id}/usuarios`, { headers: auth() }).then(r => r.json()).catch(() => []),
    ]).then(([t, cob, users]) => {
      setTenant(t)
      setCobrancas(Array.isArray(cob) ? cob : [])
      setUsuarios(Array.isArray(users) ? users : [])
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

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setSalvandoUsuario(true); setErroUsuario('')
    try {
      const res = await fetch(`${API}/superadmin/clientes/${id}/usuarios`, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(formUsuario),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Erro ${res.status}`)
      }
      setModalUsuario(false)
      setFormUsuario({ nome: '', email: '', senha: '', papel: 'OPERADOR' })
      loadUsuarios()
    } catch (err) {
      setErroUsuario(String(err instanceof Error ? err.message : err))
    } finally {
      setSalvandoUsuario(false)
    }
  }

  async function alterarUsuario(u: UsuarioTenant, data: { papel?: string; ativo?: boolean }) {
    setAcaoUsuario(u.id)
    try {
      await fetch(`${API}/superadmin/clientes/${id}/usuarios/${u.id}`, {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      loadUsuarios()
    } finally {
      setAcaoUsuario(null)
    }
  }

  async function resetarSenha(e: React.FormEvent) {
    e.preventDefault()
    if (!resetando) return
    setSalvandoUsuario(true); setErroUsuario('')
    try {
      const res = await fetch(`${API}/superadmin/clientes/${id}/usuarios/${resetando.id}/resetar-senha`, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha: novaSenha }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Erro ${res.status}`)
      }
      setResetando(null); setNovaSenha('')
    } catch (err) {
      setErroUsuario(String(err instanceof Error ? err.message : err))
    } finally {
      setSalvandoUsuario(false)
    }
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
    { key: 'usuarios',    label: `Usuários (${usuarios.length})` },
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
        </div>
      )}

      {/* Tab: Usuários */}
      {tab === 'usuarios' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setFormUsuario({ nome: '', email: '', senha: '', papel: 'OPERADOR' }); setErroUsuario(''); setModalUsuario(true) }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Novo usuário
            </button>
          </div>

          <div className="card p-0 overflow-hidden">
            {usuarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                <Users className="h-10 w-10 text-gray-200" />
                <p className="text-sm">Nenhum usuário cadastrado neste cliente</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Papel</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Criado em</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map(u => (
                      <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <span className="inline-flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-gray-300" /> {u.nome}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{u.email}</td>
                        <td className="px-4 py-3">
                          <select
                            className="input py-1 text-xs w-28"
                            value={u.papel}
                            disabled={acaoUsuario === u.id || u.papel === 'SUPERADMIN'}
                            onChange={e => alterarUsuario(u, { papel: e.target.value })}
                          >
                            {u.papel === 'SUPERADMIN' && <option value="SUPERADMIN">Superadmin</option>}
                            <option value="ADMIN">Admin</option>
                            <option value="OPERADOR">Operador</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span className={u.ativo ? 'badge-green' : 'badge-gray'}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{new Date(u.criadoEm).toLocaleDateString('pt-BR')}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => { setResetando(u); setNovaSenha(''); setErroUsuario('') }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors"
                              title="Resetar senha"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => alterarUsuario(u, { ativo: !u.ativo })}
                              disabled={acaoUsuario === u.id}
                              className={`p-1.5 rounded-lg transition-colors ${u.ativo ? 'hover:bg-red-50 text-gray-400 hover:text-red-500' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'}`}
                              title={u.ativo ? 'Desativar usuário' : 'Reativar usuário'}
                            >
                              {acaoUsuario === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

      {/* Modal: novo usuário */}
      {modalUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="font-heading font-semibold text-gray-800">Novo usuário — {tenant.nome}</h2>
              <button onClick={() => setModalUsuario(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={criarUsuario} className="p-6 space-y-4">
              <div>
                <label className="label">Nome *</label>
                <input className="input" required value={formUsuario.nome} onChange={e => setFormUsuario(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" required value={formUsuario.email} onChange={e => setFormUsuario(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Senha * (mín. 6 caracteres)</label>
                <input type="password" className="input" required minLength={6} value={formUsuario.senha} onChange={e => setFormUsuario(f => ({ ...f, senha: e.target.value }))} />
              </div>
              <div>
                <label className="label">Papel *</label>
                <select className="input" value={formUsuario.papel} onChange={e => setFormUsuario(f => ({ ...f, papel: e.target.value as 'ADMIN' | 'OPERADOR' }))}>
                  <option value="ADMIN">Admin</option>
                  <option value="OPERADOR">Operador</option>
                </select>
              </div>
              {erroUsuario && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erroUsuario}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalUsuario(false)} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={salvandoUsuario} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {salvandoUsuario ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {salvandoUsuario ? 'Criando...' : 'Criar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: resetar senha */}
      {resetando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="font-heading font-semibold text-gray-800">Resetar senha — {resetando.nome}</h2>
              <button onClick={() => setResetando(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={resetarSenha} className="p-6 space-y-4">
              <div>
                <label className="label">Nova senha * (mín. 6 caracteres)</label>
                <input type="password" className="input" required minLength={6} value={novaSenha} onChange={e => setNovaSenha(e.target.value)} autoFocus />
              </div>
              {erroUsuario && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erroUsuario}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setResetando(null)} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={salvandoUsuario} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {salvandoUsuario ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {salvandoUsuario ? 'Salvando...' : 'Definir nova senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
