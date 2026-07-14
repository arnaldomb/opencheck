'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Package, Plus, Loader2, Pencil, X, Save, Power } from 'lucide-react'

interface Plano {
  id: string; nome: string; descricao?: string | null
  faixaMin: number; faixaMax?: number | null; precoConta?: number | null
  ordem: number; ativo: boolean; _count?: { assinaturas: number }
}

interface FormState {
  nome: string; descricao: string; faixaMin: string; faixaMax: string
  precoConta: string; ordem: string
}

const EMPTY: FormState = { nome: '', descricao: '', faixaMin: '1', faixaMax: '', precoConta: '', ordem: '0' }

function faixaLabel(p: Plano) {
  if (p.faixaMax == null) return `Acima de ${p.faixaMin - 1}`
  return `${p.faixaMin} a ${p.faixaMax}`
}

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
    setForm({ ...EMPTY, ordem: String(planos.length) }); setEditando(null); setErro(''); setModal('novo')
  }

  function abrirEditar(p: Plano) {
    setForm({
      nome:       p.nome,
      descricao:  p.descricao ?? '',
      faixaMin:   String(p.faixaMin),
      faixaMax:   p.faixaMax != null ? String(p.faixaMax) : '',
      precoConta: p.precoConta != null ? String(p.precoConta) : '',
      ordem:      String(p.ordem),
    })
    setEditando(p); setErro(''); setModal('editar')
  }

  function fecharModal() { setModal(null); setEditando(null); setErro('') }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    try {
      const payload = {
        nome:       form.nome,
        descricao:  form.descricao || undefined,
        faixaMin:   Number(form.faixaMin),
        faixaMax:   form.faixaMax ? Number(form.faixaMax) : null,
        precoConta: form.precoConta ? Number(form.precoConta) : null,
        ordem:      Number(form.ordem),
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
    if (!confirm(`${acao} a faixa "${p.nome}"? Faixas desativadas não aparecem para novas assinaturas.`)) return
    setToggling(p.id)
    try {
      await apiFetch(`/superadmin/planos/${p.id}`, { method: 'PUT', body: JSON.stringify({ ativo: !p.ativo }) })
      load()
    } finally {
      setToggling(null)
    }
  }

  const ordenados = [...planos].sort((a, b) => a.ordem - b.ordem)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Pacotes (faixas de preço)</h1>
          <p className="text-gray-500 text-sm mt-1">Preço por conta/mês conforme a quantidade contratada</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nova faixa
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Plano</th>
                  <th className="px-6 py-3">Faixa de contas</th>
                  <th className="px-6 py-3">Preço/conta/mês</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Assinaturas</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map(p => (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${!p.ativo ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
                        <Package className="h-4 w-4 text-ggtech-blue" /> {p.nome}
                      </span>
                      {p.descricao && <p className="text-xs text-gray-400 mt-0.5">{p.descricao}</p>}
                    </td>
                    <td className="px-6 py-4 text-gray-700">{faixaLabel(p)}</td>
                    <td className="px-6 py-4">
                      {p.precoConta != null
                        ? <span className="font-semibold text-gray-900">R$ {Number(p.precoConta).toFixed(2)}</span>
                        : <span className="text-gray-400">Negociado</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={p.ativo ? 'badge-green' : 'badge-gray'}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{p._count?.assinaturas ?? 0}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => abrirEditar(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-ggtech-blue transition-colors" title="Editar faixa">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggleAtivo(p)}
                          disabled={toggling === p.id}
                          className={`p-1.5 rounded-lg transition-colors ${p.ativo ? 'hover:bg-red-50 text-gray-400 hover:text-red-500' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'}`}
                          title={p.ativo ? 'Desativar faixa' : 'Reativar faixa'}
                        >
                          {toggling === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal criar/editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
              <h2 className="font-heading font-semibold text-gray-800">
                {modal === 'novo' ? 'Nova faixa de preço' : `Editar: ${editando?.nome}`}
              </h2>
              <button onClick={fecharModal} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">Nome do plano *</label>
                  <input className="input" required value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Single, Starter, Profissional..." />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Descrição</label>
                  <input className="input" value={form.descricao} onChange={e => set('descricao', e.target.value)} />
                </div>
                <div>
                  <label className="label">Faixa mínima (contas) *</label>
                  <input type="number" min="1" className="input" required value={form.faixaMin} onChange={e => set('faixaMin', e.target.value)} />
                </div>
                <div>
                  <label className="label">Faixa máxima (contas)</label>
                  <input type="number" min="1" className="input" value={form.faixaMax} onChange={e => set('faixaMax', e.target.value)}
                    placeholder="Vazio = sem limite (Sob Cotação)" />
                </div>
                <div>
                  <label className="label">Preço por conta/mês (R$)</label>
                  <input type="number" min="0" step="0.01" className="input" value={form.precoConta} onChange={e => set('precoConta', e.target.value)}
                    placeholder="Vazio = valor negociado" />
                </div>
                <div>
                  <label className="label">Ordem de exibição</label>
                  <input type="number" min="0" className="input" value={form.ordem} onChange={e => set('ordem', e.target.value)} />
                </div>
              </div>
              {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={fecharModal} className="btn-ghost flex-1">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Salvando...' : modal === 'novo' ? 'Criar faixa' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
