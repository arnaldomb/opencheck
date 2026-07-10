'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { ShieldCheck, Plus, Phone, MapPin, Loader2, Pencil, Trash2, X, Save, Copy, Check, Hash, KeyRound, Footprints } from 'lucide-react'

interface Supervisor {
  id: string
  nome: string
  telefone?: string
  codigo?: string
  agentKey?: string
  ativo: boolean
  pontos?: { id: string; nome: string }[]
}

const EMPTY = { nome: '', telefone: '' }

export default function SupervisoresPage() {
  const [supervisores, setSupervisores] = useState<Supervisor[]>([])
  const [loading, setLoading]           = useState(true)
  const [modal, setModal]               = useState<'novo' | 'editar' | null>(null)
  const [editando, setEditando]         = useState<Supervisor | null>(null)
  const [saving, setSaving]             = useState(false)
  const [deletando, setDeletando]       = useState<string | null>(null)
  const [gerando, setGerando]           = useState<string | null>(null)
  const [copied, setCopied]             = useState<string | null>(null)
  const [erro, setErro]                 = useState('')
  const [form, setForm]                 = useState({ ...EMPTY })

  function setF(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<Supervisor[]>('/supervisores')
      setSupervisores(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function abrirNovo() {
    setForm({ ...EMPTY }); setEditando(null); setErro(''); setModal('novo')
  }

  function abrirEditar(s: Supervisor) {
    setForm({ nome: s.nome, telefone: s.telefone ?? '' })
    setEditando(s); setErro(''); setModal('editar')
  }

  function fecharModal() { setModal(null); setEditando(null); setErro('') }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    try {
      if (modal === 'novo') {
        await apiFetch('/supervisores', { method: 'POST', body: JSON.stringify(form) })
      } else if (editando) {
        await apiFetch(`/supervisores/${editando.id}`, { method: 'PUT', body: JSON.stringify({ nome: form.nome, telefone: form.telefone }) })
      }
      fecharModal(); load()
    } catch (err) {
      setErro(String(err))
    } finally { setSaving(false) }
  }

  async function handleExcluir(s: Supervisor) {
    if (!confirm(`Desativar supervisor "${s.nome}"?`)) return
    setDeletando(s.id)
    try {
      await apiFetch(`/supervisores/${s.id}`, { method: 'DELETE' })
      load()
    } finally { setDeletando(null) }
  }

  async function handleCopiar(s: Supervisor) {
    if (!s.codigo) return
    await navigator.clipboard.writeText(s.codigo).catch(() => {})
    setCopied(s.id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleRegenerarChave(s: Supervisor) {
    if (!confirm(`Regenerar chave de acesso de "${s.nome}"? A chave atual será invalidada.`)) return
    setGerando(s.id)
    try {
      const res = await apiFetch<{ id: string; agentKey: string }>(`/supervisores/${s.id}/agentkey/regenerar`, { method: 'POST' })
      setSupervisores(prev => prev.map(x => x.id === s.id ? { ...x, agentKey: res.agentKey } : x))
    } finally { setGerando(null) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Supervisores</h1>
          <p className="text-gray-500 text-sm mt-1">{supervisores.length} supervisor(es) cadastrado(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/supervisores/rondas" className="btn-ghost flex items-center gap-2">
            <Footprints className="h-4 w-4" /> Rondas
          </Link>
          <button onClick={abrirNovo} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Novo supervisor
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : supervisores.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <ShieldCheck className="h-12 w-12 text-gray-200" />
          <p className="font-medium">Nenhum supervisor cadastrado</p>
          <button onClick={abrirNovo} className="btn-primary mt-2 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Cadastrar primeiro supervisor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {supervisores.map(s => (
            <div key={s.id} className="card space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-indigo-600 font-bold text-sm">{s.nome[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 leading-tight">{s.nome}</p>
                    <span className={s.ativo ? 'badge-green' : 'badge-gray'}>{s.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => abrirEditar(s)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors" title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleExcluir(s)} disabled={deletando === s.id} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Desativar">
                    {deletando === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {s.telefone && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone className="h-3.5 w-3.5" /> {s.telefone}
                </div>
              )}
              {s.pontos && s.pontos.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{s.pontos.map(p => p.nome).join(', ')}</span>
                </div>
              )}

              {/* Código de acesso (4 dígitos para login no app) */}
              <div className="border-t border-gray-100 pt-2 space-y-2">
                {s.codigo && (
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 flex-shrink-0">código:</span>
                    <code className="flex-1 text-base font-mono font-bold text-indigo-600 tracking-widest">{s.codigo}</code>
                    <button onClick={() => handleCopiar(s)} title="Copiar código" className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors flex-shrink-0">
                      {copied === s.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => handleRegenerarChave(s)}
                  disabled={gerando === s.id}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 hover:underline disabled:opacity-50 transition-colors"
                >
                  {gerando === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                  Regenerar chave de acesso
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="font-heading font-semibold text-gray-800">
                {modal === 'novo' ? 'Novo supervisor' : `Editar: ${editando?.nome}`}
              </h2>
              <button onClick={fecharModal} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSalvar} className="p-6 space-y-4">
              <div>
                <label className="label">Nome *</label>
                <input className="input" required value={form.nome} onChange={e => setF('nome', e.target.value)} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" placeholder="+55 11 99999-9999" value={form.telefone} onChange={e => setF('telefone', e.target.value)} />
              </div>
              {modal === 'novo' && (
                <p className="text-xs text-gray-400">
                  Um código de 4 dígitos e uma chave de acesso serão gerados automaticamente.
                </p>
              )}
              {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={fecharModal} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Salvando...' : modal === 'novo' ? 'Cadastrar' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
