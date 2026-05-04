'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Package, Plus, Loader2 } from 'lucide-react'

interface Plano {
  id: string; nome: string; valorMensal: number; valorAnual?: number
  pontosIncluidos: number; ativo: boolean; _count?: { assinaturas: number }
}

interface FormState {
  nome: string; valorMensal: string; valorAnual: string; pontosIncluidos: string
}

export default function PlanosPage() {
  const [planos, setPlanos]     = useState<Plano[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [erro, setErro]         = useState('')
  const [form, setForm] = useState<FormState>({ nome: '', valorMensal: '', valorAnual: '', pontosIncluidos: '5' })

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErro('')
    try {
      await apiFetch('/superadmin/planos', {
        method: 'POST',
        body: JSON.stringify({
          nome: form.nome,
          valorMensal:      Number(form.valorMensal),
          valorAnual:       form.valorAnual ? Number(form.valorAnual) : undefined,
          pontosIncluidos:  Number(form.pontosIncluidos),
        }),
      })
      setShowForm(false)
      setForm({ nome: '', valorMensal: '', valorAnual: '', pontosIncluidos: '5' })
      load()
    } catch (err) {
      setErro(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Planos</h1>
          <p className="text-gray-500 text-sm mt-1">{planos.length} plano(s) cadastrado(s)</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo plano
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4">
          <h2 className="font-heading font-semibold text-gray-800">Novo plano</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Nome do plano *</label>
                <input className="input" required value={form.nome} onChange={e => set('nome', e.target.value)} />
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
            </div>
            {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Criando...' : 'Criar plano'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {planos.map(p => (
            <div key={p.id} className="card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-ggtech-blue" />
                  <p className="font-heading font-semibold text-gray-900">{p.nome}</p>
                </div>
                <span className={p.ativo ? 'badge-green' : 'badge-gray'}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-gray-700">
                  <span className="font-semibold text-lg text-gray-900">R$ {Number(p.valorMensal).toFixed(2)}</span>
                  <span className="text-gray-400">/mês</span>
                </p>
                {p.valorAnual && (
                  <p className="text-gray-500">R$ {Number(p.valorAnual).toFixed(2)}/ano</p>
                )}
                <p className="text-gray-500">{p.pontosIncluidos} pontos incluídos</p>
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
    </div>
  )
}
