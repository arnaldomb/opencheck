'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { DollarSign, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'

interface ResumoFinanceiro {
  mrr: number
  arr: number
  inadimplentes: number
  totalAtivos: number
}

interface Cobranca {
  id: string; valor: number; status: string; billingType: string
  vencimentoEm: string; tenant: { nome: string }
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: 'Pendente',  cls: 'badge-yellow' },
  RECEIVED:  { label: 'Recebido', cls: 'badge-green'  },
  OVERDUE:   { label: 'Vencido',  cls: 'badge-red'    },
  REFUNDED:  { label: 'Estornado',cls: 'badge-gray'   },
}

export default function FinanceiroPage() {
  const [resumo, setResumo]     = useState<ResumoFinanceiro | null>(null)
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch<ResumoFinanceiro>('/superadmin/financeiro/resumo'),
      apiFetch<Cobranca[]>('/superadmin/financeiro/cobrancas'),
    ]).then(([r, c]) => {
      setResumo(r)
      setCobrancas(c)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl text-gray-900">Financeiro</h1>
        <p className="text-gray-500 text-sm mt-1">Receitas e cobranças via Asaas</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'MRR',               value: `R$ ${(resumo?.mrr ?? 0).toFixed(2)}`,  icon: TrendingUp,    color: 'bg-ggtech-blue' },
          { label: 'ARR',               value: `R$ ${(resumo?.arr ?? 0).toFixed(2)}`,  icon: DollarSign,    color: 'bg-emerald-500' },
          { label: 'Clientes ativos',   value: resumo?.totalAtivos ?? 0,               icon: CheckCircle,   color: 'bg-violet-500' },
          { label: 'Inadimplentes',     value: resumo?.inadimplentes ?? 0,             icon: AlertTriangle, color: 'bg-red-500' },
        ].map(kpi => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="card flex items-start gap-4">
              <div className={`p-3 rounded-xl ${kpi.color}`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xl font-heading font-bold text-gray-900">{kpi.value}</p>
                <p className="text-sm text-gray-500">{kpi.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cobranças */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-ggtech-blue" />
          <h2 className="font-heading font-semibold text-gray-900">Cobranças recentes</h2>
        </div>

        {cobrancas.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            Nenhuma cobrança registrada
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Vencimento</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Valor</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Forma</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cobrancas.map(c => {
                const st = STATUS_CFG[c.status] ?? { label: c.status, cls: 'badge-gray' }
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{c.tenant.nome}</td>
                    <td className="px-6 py-4 text-gray-600">{new Date(c.vencimentoEm).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 text-gray-900 font-medium">R$ {Number(c.valor).toFixed(2)}</td>
                    <td className="px-6 py-4 text-gray-600">{c.billingType}</td>
                    <td className="px-6 py-4"><span className={st.cls}>{st.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
