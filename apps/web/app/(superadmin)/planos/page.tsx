'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Package, Plus, Loader2, Pencil, X, Save, Power } from 'lucide-react'

interface Plano {
  id: string; nome: string; descricao?: string | null
  valorMensal: number; valorAnual?: number | null
  pontosIncluidos: number; limiteUsuarios: number
  ativo: boolean; _count?: { assinaturas: number }
}

interface FormState {
  nome: string; descricao: string; valorMensal: string; valorAnual: string
  pontosIncluidos: string; limiteUsuarios: string
}

const EMPTY: FormState = { nome: '', descricao: '', valorMensal: '', valorAnual: '', pontosIncluidos: '5', limiteUsuarios: '10' }

export default function PlanosPage() {
  const [planos, setPlanos]     = useState<Plano[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState<'novo' | 'editar' | null>(null)
  const [editando, setEditando] = useState<Plano | null>(null)
  const [saving, setSaving]     = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [erro, setErro]         = useState('')
  const [form, setForm]         = useState<FormState>({ ...EMPTY })

  function set(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<Plano[]>('/superadmin/planos')
      setPlanos(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function abrirNovo() {
    setForm({ ...EMPTY }); setEditando(null); setErro(''); setModal('novo')
  }

  function abrirEditar(p: Plano) {
    setForm({
      nome:            p.nome,
      descricao:       p.descricao ?? '',
      valorMensal:     String(p.valorMensal),
      valorAnual:      p.valorAnual != null ? String(p.valorAnual) : '',
      pontosIncluidos: String(p.pontosIncluidos),
      limiteUsuarios:  String(p.limiteUsuarios),
    })
    setEditando(p); setErro(''); setModal('editar')
  }

  function fecharModal() { setModal(null); setEditando(null); setErro('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    try {
      const payload = {
        nome:            form.nome,
        descricao:       form.descricao || undefined,
        valorMensal:     Number(form.valorMensal),
        valorAnual:      form.valorAnual ? Number(form.valorAnual) : null,
        pontosIncluidos: Number(form.pontosIncluidos),
        limiteUsuarios:  Number(form.limiteUsuarios),
      }
      if (modal === 'novo') {
        await apiFetch('/superadmin/planos', { method: 'POST', body: JSON.stringify(payload) })
      } else if (editando) {
        await apiFetch(`/superadmin/planos/${editando.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      }
      fecharModal(); load()
    } catch (err) {
      setErro(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(p: Plano) {
    const acao = p.ativo ? 'Desativar' : 'Reativar'
    if (!confirm(`${acao} o plano "${p.nome}"? Planos desativados não aparecem para novas assinaturas.`)) return
    setToggling(p.id)
    try {
      await apiFetch(`/superadmin/planos/${p.id}`, { method: 'PUT', body: JSON.stringify({ ativo: !p.ativo }) })
      load()
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Planos</h1>
          <p className="text-gray-500 text-sm mt-1">{planos.length} plano(s) cadastrado(s)</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo plano
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {planos.map(p => (
            <div key={p.id} className={`card space-y-3 ${!p.ativo ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-ggtech-blue" />
                  <p className="font-heading font-semibold text-gray-900">{p.nome}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className={p.ativo ? 'badge-green' : 'badge-gray'}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
                  <button onClick={() => abrirEditar(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors" title="Editar plano">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggleAtivo(p)}
                    disabled={toggling === p.id}
                    className={`p-1.5 rounded-lg transition-colors ${p.ativo ? 'hover:bg-red-50 text-gray-400 hover:text-red-500' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'}`}
                    title={p.ativo ? 'Desativar plano' : 'Reativar plano'}
                  >
                    {toggling === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              {p.descricao && <p className="text-xs text-gray-400">{p.descricao}</p>}
              <div className="space-y-1 text-sm">
                <p className="text-gray-700">
                  <span className="font-semibold text-lg text-gray-900">R$ {Number(p.valorMensal).toFixed(2)}</span>
                  <span className="text-gray-400">/mês</span>
                </p>
                {p.valorAnual != null && (
                  <p className="text-gray-500">R$ {Number(p.valorAnual).toFixed(2)}/ano</p>
                )}
                <p className="text-gray-500">{p.pontosIncluidos} pontos incluídos</p>
                <p className="text-gray-500">{p.limiteUsuarios} usuários</p>
              </div>
              {p._count && (
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
                  {p._count.assinaturas} assinatura(s) ativa(s)
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="font-heading font-semibold text-gray-800">
                {modal === 'novo' ? 'Novo plano' : `Editar: ${editando?.nome}`}
              </h2>
              <button onClick={fecharModal} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Nome do plano *</label>
                  <input className="input" required value={form.nome} onChange={e => set('nome', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Descrição</label>
                  <input className="input" value={form.descricao} onChange={e => set('descricao', e.target.value)} />
                </div>
                <div>
                  <label className="label">Valor mensal (R$) *</label>
                  <input type="number" min="0" step="0.01" className="input" required value={form.valorMensal} onChange={e => set('valorMensal', e.target.value)} />
                </div>
                <div>
                  <label className="label">Valor anual (R$)</label>
                  <input type="number" min="0" step="0.01" className="input" value={form.valorAnual} onChange={e => set('valorAnual', e.target.value)} />
                </div>
                <div>
                  <label className="label">Pontos incluídos *</label>
                  <input type="number" min="1" className="input" required value={form.pontosIncluidos} onChange={e => set('pontosIncluidos', e.target.value)} />
                </div>
                <div>
                  <label className="label">Limite de usuários *</label>
                  <input type="number" min="1" className="input" required value={form.limiteUsuarios} onChange={e => set('limiteUsuarios', e.target.value)} />
                </div>
              </div>
              {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={fecharModal} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Salvando...' : modal === 'novo' ? 'Criar plano' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
