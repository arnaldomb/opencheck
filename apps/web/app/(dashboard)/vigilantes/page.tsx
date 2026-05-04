'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Users, Plus, Phone, Mail, MapPin, Loader2, Pencil, Trash2, X, Save, Copy, Check, Hash } from 'lucide-react'

interface Vigilante {
  id: string; nome: string; email?: string; telefone?: string; rfid?: string
  ativo: boolean; pontos?: { id: string; nome: string }[]
  codigo?: string
}

const EMPTY = { nome: '', email: '', telefone: '', senha: '' }

export default function VigilantesPage() {
  const [vigilantes, setVigilantes] = useState<Vigilante[]>([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState<'novo' | 'editar' | null>(null)
  const [editando, setEditando]     = useState<Vigilante | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deletando, setDeletando]   = useState<string | null>(null)
  const [gerando, setGerando]       = useState<string | null>(null)
  const [copied, setCopied]         = useState<string | null>(null)
  const [erro, setErro]             = useState('')
  const [form, setForm]             = useState({ ...EMPTY })

  function setF(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function load() {
    setLoading(true)
    try {
      const vigs = await apiFetch<Vigilante[]>('/vigilantes')
      setVigilantes(vigs)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function abrirNovo() {
    setForm({ ...EMPTY }); setEditando(null); setErro(''); setModal('novo')
  }

  function abrirEditar(v: Vigilante) {
    setForm({ nome: v.nome, email: v.email ?? '', telefone: v.telefone ?? '', senha: '' })
    setEditando(v); setErro(''); setModal('editar')
  }

  function fecharModal() { setModal(null); setEditando(null); setErro('') }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    try {
      if (modal === 'novo') {
        await apiFetch('/vigilantes', { method: 'POST', body: JSON.stringify(form) })
      } else if (editando) {
        const payload: Record<string, string> = { nome: form.nome, telefone: form.telefone }
        await apiFetch(`/vigilantes/${editando.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      }
      fecharModal(); load()
    } catch (err) {
      setErro(String(err))
    } finally { setSaving(false) }
  }

  async function handleExcluir(v: Vigilante) {
    if (!confirm(`Desativar vigilante "${v.nome}"?`)) return
    setDeletando(v.id)
    try {
      await apiFetch(`/vigilantes/${v.id}`, { method: 'DELETE' })
      load()
    } finally { setDeletando(null) }
  }

  async function handleCopiar(v: Vigilante) {
    if (!v.codigo) return
    await navigator.clipboard.writeText(v.codigo).catch(() => {})
    setCopied(v.id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleGerarCodigo(v: Vigilante) {
    setGerando(v.id)
    try {
      const res = await apiFetch<{ id: string; codigo: string }>(`/vigilantes/${v.id}/codigo/gerar`, { method: 'POST' })
      setVigilantes(prev => prev.map(x => x.id === v.id ? { ...x, codigo: res.codigo } : x))
    } finally { setGerando(null) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Vigilantes</h1>
          <p className="text-gray-500 text-sm mt-1">{vigilantes.length} vigilante(s) cadastrado(s)</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo vigilante
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : vigilantes.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <Users className="h-12 w-12 text-gray-200" />
          <p className="font-medium">Nenhum vigilante cadastrado</p>
          <button onClick={abrirNovo} className="btn-primary mt-2 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Cadastrar primeiro vigilante
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vigilantes.map(v => (
            <div key={v.id} className="card space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-ggtech-blue/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-ggtech-blue font-bold text-sm">{v.nome[0]}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 leading-tight">{v.nome}</p>
                    <span className={v.ativo ? 'badge-green' : 'badge-gray'}>{v.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => abrirEditar(v)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors" title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleExcluir(v)} disabled={deletando === v.id} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Desativar">
                    {deletando === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {v.telefone && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone className="h-3.5 w-3.5" /> {v.telefone}
                </div>
              )}
              {v.email && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail className="h-3.5 w-3.5" /> {v.email}
                </div>
              )}
              {v.pontos && v.pontos.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{v.pontos.map(p => p.nome).join(', ')}</span>
                </div>
              )}

              {/* Código de identificação */}
              <div className="border-t border-gray-100 pt-2">
                {v.codigo ? (
                  <div className="flex items-center gap-2">
                    <Hash className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 flex-shrink-0">vigilanteId:</span>
                    <code className="flex-1 text-base font-mono font-bold text-ggtech-blue tracking-widest">{v.codigo}</code>
                    <button onClick={() => handleCopiar(v)} title="Copiar código" className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors flex-shrink-0">
                      {copied === v.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => handleGerarCodigo(v)} disabled={gerando === v.id}
                    className="flex items-center gap-1.5 text-xs text-ggtech-blue hover:underline disabled:opacity-50">
                    {gerando === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hash className="h-3 w-3" />}
                    Gerar código de identificação
                  </button>
                )}
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
                {modal === 'novo' ? 'Novo vigilante' : `Editar: ${editando?.nome}`}
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">E-mail</label>
                    <input type="email" className="input" value={form.email} onChange={e => setF('email', e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Senha inicial *</label>
                    <input type="password" className="input" required value={form.senha} onChange={e => setF('senha', e.target.value)} />
                  </div>
                </div>
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
