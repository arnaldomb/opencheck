'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { MapPin, Plus, Pencil, Trash2, Loader2, X, Save, AlertTriangle, Settings } from 'lucide-react'

interface Ponto {
  id: string; nome: string; descricao?: string; endereco?: string; ativo: boolean
}
interface Assinatura { pontosContratados: number; status: string }

const EMPTY = { nome: '', descricao: '', endereco: '' }

export default function PontosPage() {
  const [pontos, setPontos]         = useState<Ponto[]>([])
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState<'novo' | 'editar' | null>(null)
  const [editando, setEditando]     = useState<Ponto | null>(null)
  const [saving, setSaving]         = useState(false)
  const [deletando, setDeletando]   = useState<string | null>(null)
  const [erro, setErro]             = useState('')
  const [form, setForm]             = useState({ ...EMPTY })

  function setF(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function load() {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const h = { Authorization: `Bearer ${token}` }
      const [pts, ass] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/pontos`, { headers: h }).then(r => r.json()),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/plano`, { headers: h }).then(r => r.json()).catch(() => null),
      ])
      setPontos(Array.isArray(pts) ? pts : [])
      setAssinatura(ass?.pontosContratados != null ? ass : null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function abrirNovo() {
    setForm({ ...EMPTY }); setEditando(null); setErro(''); setModal('novo')
  }

  function abrirEditar(p: Ponto) {
    setForm({ nome: p.nome, descricao: p.descricao ?? '', endereco: p.endereco ?? '' })
    setEditando(p); setErro(''); setModal('editar')
  }

  function fecharModal() { setModal(null); setEditando(null); setErro('') }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    try {
      if (modal === 'novo') {
        await apiFetch('/pontos', { method: 'POST', body: JSON.stringify(form) })
      } else if (editando) {
        await apiFetch(`/pontos/${editando.id}`, { method: 'PUT', body: JSON.stringify(form) })
      }
      fecharModal(); load()
    } catch (err) {
      setErro(String(err))
    } finally { setSaving(false) }
  }

  async function handleExcluir(p: Ponto) {
    if (!confirm(
      `Excluir o ponto "${p.nome}"?\n\n` +
      'Esta ação é PERMANENTE: remove ciclos, registros de abertura/fechamento e rondas deste ponto. ' +
      'Os eventos são mantidos no histórico.'
    )) return
    setDeletando(p.id)
    try {
      await apiFetch(`/pontos/${p.id}`, { method: 'DELETE' })
      load()
    } finally { setDeletando(null) }
  }

  const ativos    = pontos.filter(p => p.ativo).length
  const limite    = assinatura?.pontosContratados ?? 0
  const bloqueado = assinatura?.status === 'INADIMPLENTE' || ativos >= limite

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Pontos de monitoramento</h1>
          <p className="text-gray-500 text-sm mt-1">
            {ativos} ativo(s){limite > 0 ? ` de ${limite} contratado(s)` : ''}
          </p>
        </div>
        <button
          onClick={abrirNovo}
          disabled={bloqueado}
          title={bloqueado ? 'Limite de pontos atingido ou assinatura inadimplente' : ''}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-4 w-4" /> Novo ponto
        </button>
      </div>

      {assinatura?.status === 'INADIMPLENTE' && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Assinatura inadimplente — novos pontos estão bloqueados.
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : pontos.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <MapPin className="h-12 w-12 text-gray-200" />
          <p className="font-medium">Nenhum ponto cadastrado</p>
          <button onClick={abrirNovo} className="btn-primary mt-2 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Criar primeiro ponto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pontos.map(p => (
            <div key={p.id} className={`card space-y-3 ${!p.ativo ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-ggtech-blue/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-5 w-5 text-ggtech-blue" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.nome}</p>
                    <span className={p.ativo ? 'badge-green' : 'badge-gray'}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Link
                    href={`/pontos/${p.id}`}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-ggtech-blue transition-colors"
                    title="Configurar (horários, agentKey…)"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => abrirEditar(p)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors"
                    title="Editar nome e endereço"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleExcluir(p)}
                    disabled={deletando === p.id}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Excluir ponto"
                  >
                    {deletando === p.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              {p.descricao && (
                <p className="text-sm text-gray-500 leading-snug line-clamp-2">{p.descricao}</p>
              )}
              {p.endereco && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {p.endereco}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="font-heading font-semibold text-gray-800">
                {modal === 'novo' ? 'Novo ponto' : `Editar: ${editando?.nome}`}
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
                <label className="label">Endereço</label>
                <input className="input" placeholder="Rua, número, cidade" value={form.endereco} onChange={e => setF('endereco', e.target.value)} />
              </div>
              <div>
                <label className="label">Descrição</label>
                <textarea className="input" rows={3} value={form.descricao} onChange={e => setF('descricao', e.target.value)} />
              </div>
              {erro && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={fecharModal} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Salvando...' : modal === 'novo' ? 'Criar ponto' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
