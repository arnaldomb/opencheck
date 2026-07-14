'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, User, CreditCard, Loader2, Save } from 'lucide-react'

interface Plano { id: string; nome: string; faixaMin: number; faixaMax?: number | null; precoConta?: number | null }

const EMPTY = {
  nome: '', email: '', cnpj: '', telefone: '',
  adminNome: '', adminEmail: '', adminSenha: '',
  planoId: '', quantidade: '', valorManual: '',
  periodicidade: 'MENSAL', billingType: 'PIX',
  trialDias: '14',
}

function setF(prev: typeof EMPTY, field: keyof typeof EMPTY, value: string): typeof EMPTY {
  return { ...prev, [field]: value }
}

export default function NovoClientePage() {
  const router = useRouter()
  const [planos, setPlanos]   = useState<Plano[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState('')
  const [form, setForm]       = useState({ ...EMPTY })

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/superadmin/planos`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setPlanos).catch(() => {})
  }, [])

  const planoSelecionado = planos.find(p => p.id === form.planoId)
  const quantidadeNum = Number(form.quantidade) || 0
  const valorPreview = planoSelecionado && quantidadeNum > 0
    ? (planoSelecionado.precoConta != null
        ? quantidadeNum * Number(planoSelecionado.precoConta)
        : (form.valorManual ? Number(form.valorManual) : null))
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')
    const token = localStorage.getItem('token')
    try {
      const tenantRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/superadmin/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nome: form.nome, email: form.email, cnpj: form.cnpj || undefined,
          telefone: form.telefone || undefined,
          adminNome: form.adminNome, adminEmail: form.adminEmail, adminSenha: form.adminSenha,
        }),
      })
      if (!tenantRes.ok) {
        const j = await tenantRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'Erro ao criar cliente')
      }
      const tenant = await tenantRes.json()

      if (form.planoId && form.quantidade) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/superadmin/clientes/${tenant.id}/assinatura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            planoId: form.planoId,
            quantidade: Number(form.quantidade),
            periodicidade: form.periodicidade,
            billingType: form.billingType,
            nextDueDate: new Date().toISOString().slice(0, 10),
            trialDias: Number(form.trialDias) || undefined,
            valorManual: form.valorManual ? Number(form.valorManual) : undefined,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? 'Cliente criado, mas falhou ao criar assinatura')
        }
      }

      router.push('/clientes')
    } catch (err) {
      setErro(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/clientes')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Novo cliente</h1>
          <p className="text-gray-500 text-sm mt-1">Cadastre uma nova empresa e vincule um plano</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Empresa */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-ggtech-blue" />
            <h2 className="font-heading font-semibold text-gray-800">Dados da empresa</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Razão social *</label>
              <input className="input" required placeholder="Nome da empresa" value={form.nome} onChange={e => setForm(f => setF(f, 'nome', e.target.value))} />
            </div>
            <div>
              <label className="label">E-mail *</label>
              <input type="email" className="input" required value={form.email} onChange={e => setForm(f => setF(f, 'email', e.target.value))} />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input className="input" placeholder="+55 11 99999-9999" value={form.telefone} onChange={e => setForm(f => setF(f, 'telefone', e.target.value))} />
            </div>
            <div>
              <label className="label">CNPJ</label>
              <input className="input" placeholder="00.000.000/0001-00" value={form.cnpj} onChange={e => setForm(f => setF(f, 'cnpj', e.target.value))} />
            </div>
          </div>
        </div>

        {/* Admin */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-ggtech-blue" />
            <h2 className="font-heading font-semibold text-gray-800">Administrador da empresa</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Nome *</label>
              <input className="input" required value={form.adminNome} onChange={e => setForm(f => setF(f, 'adminNome', e.target.value))} />
            </div>
            <div>
              <label className="label">E-mail *</label>
              <input type="email" className="input" required value={form.adminEmail} onChange={e => setForm(f => setF(f, 'adminEmail', e.target.value))} />
            </div>
            <div>
              <label className="label">Senha inicial *</label>
              <input type="password" className="input" required value={form.adminSenha} onChange={e => setForm(f => setF(f, 'adminSenha', e.target.value))} />
            </div>
          </div>
        </div>

        {/* Assinatura */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 text-ggtech-blue" />
            <h2 className="font-heading font-semibold text-gray-800">Assinatura</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Plano (faixa de preço)</label>
              <select className="input" value={form.planoId} onChange={e => setForm(f => setF(f, 'planoId', e.target.value))}>
                <option value="">Sem plano (configurar depois)</option>
                {planos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {p.precoConta != null ? `R$ ${Number(p.precoConta).toFixed(2)}/conta` : 'negociado'}
                    {' '}({p.faixaMax != null ? `${p.faixaMin}-${p.faixaMax}` : `acima de ${p.faixaMin - 1}`} contas)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Quantidade contratada (contas)</label>
              <input type="number" min="1" className="input" placeholder="ex: 15"
                value={form.quantidade} onChange={e => setForm(f => setF(f, 'quantidade', e.target.value))} />
            </div>
            {planoSelecionado?.precoConta == null && form.planoId && (
              <div>
                <label className="label">Valor mensal (R$) — plano sob cotação</label>
                <input type="number" min="0" step="0.01" className="input"
                  value={form.valorManual} onChange={e => setForm(f => setF(f, 'valorManual', e.target.value))} />
              </div>
            )}
            {valorPreview != null && (
              <div className="sm:col-span-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                Valor mensal estimado: <strong>R$ {valorPreview.toFixed(2)}</strong>
              </div>
            )}
            <div>
              <label className="label">Periodicidade</label>
              <select className="input" value={form.periodicidade} onChange={e => setForm(f => setF(f, 'periodicidade', e.target.value))}>
                <option value="MENSAL">Mensal</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>
            <div>
              <label className="label">Forma de pagamento</label>
              <select className="input" value={form.billingType} onChange={e => setForm(f => setF(f, 'billingType', e.target.value))}>
                <option value="PIX">Pix</option>
                <option value="BOLETO">Boleto</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
              </select>
            </div>
            <div>
              <label className="label">Dias de trial</label>
              <input type="number" min="0" className="input" placeholder="0 = sem trial" value={form.trialDias} onChange={e => setForm(f => setF(f, 'trialDias', e.target.value))} />
            </div>
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{erro}</div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={() => router.push('/clientes')} className="btn-ghost">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {loading ? 'Criando...' : 'Criar cliente'}
          </button>
        </div>
      </form>
    </div>
  )
}
