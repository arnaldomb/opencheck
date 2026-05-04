'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function NovoPontoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState('')
  const [form, setForm] = useState({
    nome: '', descricao: '', endereco: '',
    intervaloAlertaMin: '30', toleranciaMin: '5', canalAlerta: 'WHATSAPP',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')
    try {
      await apiFetch('/pontos', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          intervaloAlertaMin: Number(form.intervaloAlertaMin),
          toleranciaMin:      Number(form.toleranciaMin),
        }),
      })
      router.push('/pontos')
    } catch (err) {
      setErro(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/pontos" className="btn-ghost p-2 rounded-lg">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Novo ponto</h1>
          <p className="text-gray-500 text-sm">Configure uma nova portaria ou guarita</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-heading font-semibold text-gray-800">Informações básicas</h2>

          <div>
            <label className="label">Nome do ponto *</label>
            <input className="input" placeholder="Ex: Portaria Principal" required value={form.nome} onChange={e => set('nome', e.target.value)} />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" placeholder="Descrição opcional" value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </div>
          <div>
            <label className="label">Endereço</label>
            <input className="input" placeholder="Endereço do ponto" value={form.endereco} onChange={e => set('endereco', e.target.value)} />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-heading font-semibold text-gray-800">Ciclo de alerta</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Intervalo (minutos) *</label>
              <input
                type="number" min="5" max="480"
                className="input"
                value={form.intervaloAlertaMin}
                onChange={e => set('intervaloAlertaMin', e.target.value)}
                required
              />
              <p className="text-xs text-gray-400 mt-1">Tempo entre check-ins</p>
            </div>
            <div>
              <label className="label">Tolerância (minutos)</label>
              <input
                type="number" min="0" max="60"
                className="input"
                value={form.toleranciaMin}
                onChange={e => set('toleranciaMin', e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Tempo extra antes do alerta</p>
            </div>
          </div>

          <div>
            <label className="label">Canal de alerta</label>
            <select className="input" value={form.canalAlerta} onChange={e => set('canalAlerta', e.target.value)}>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="CTRLSAFE">CTRL+SAFE</option>
              <option value="AMBOS">WhatsApp + CTRL+SAFE</option>
            </select>
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{erro}</div>
        )}

        <div className="flex gap-3">
          <Link href="/pontos" className="btn-outline flex-1 text-center py-2.5">Cancelar</Link>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Criando...' : 'Criar ponto'}
          </button>
        </div>
      </form>
    </div>
  )
}
