'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Calendar, CheckCircle, AlertCircle, Clock, XCircle } from 'lucide-react'

interface Assinatura {
  status: string
  periodicidade: string
  pontosContratados: number
  proximaCobrancaEm?: string
  trialAteEm?: string
  plano: { nome: string; valorMensal: number; valorAnual?: number }
}

interface Cobranca {
  id: string; valor: number; status: string; billingType: string
  vencimentoEm: string; paguEm?: string
}

const STATUS_MAP: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  TRIAL:        { label: 'Trial',        cls: 'badge-blue',   Icon: Clock },
  ATIVA:        { label: 'Ativa',        cls: 'badge-green',  Icon: CheckCircle },
  INADIMPLENTE: { label: 'Inadimplente', cls: 'badge-yellow', Icon: AlertCircle },
  SUSPENSA:     { label: 'Suspensa',     cls: 'badge-red',    Icon: XCircle },
  CANCELADA:    { label: 'Cancelada',    cls: 'badge-gray',   Icon: XCircle },
}

const COB_STATUS: Record<string, string> = {
  PENDENTE: 'Pendente', CONFIRMADA: 'Confirmada', RECEBIDA: 'Recebida',
  VENCIDA: 'Vencida', ESTORNADA: 'Estornada',
}

export default function PlanoPage() {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [cobrancas, setCobrancas]   = useState<Cobranca[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const h = { Authorization: `Bearer ${token}` }
    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/plano`, { headers: h }).then(r => r.json()),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/plano/cobrancas`, { headers: h }).then(r => r.json()),
    ]).then(([ass, cob]) => {
      setAssinatura(ass && ass.plano ? ass : null)
      setCobrancas(Array.isArray(cob) ? cob : [])
      setLoading(false)
    }).catch(() => { setAssinatura(null); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  if (!assinatura) return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-gray-900">Meu Plano</h1>
        <p className="text-gray-500 text-sm mt-1">Informações da sua assinatura</p>
      </div>
      <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <CreditCard className="h-12 w-12 text-gray-200" />
        <p className="font-medium text-gray-600">Nenhum plano contratado</p>
        <p className="text-sm">Entre em contato com o suporte para contratar um plano.</p>
      </div>
    </div>
  )

  const st = STATUS_MAP[assinatura.status] ?? STATUS_MAP.CANCELADA
  const { Icon } = st

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-gray-900">Meu Plano</h1>
        <p className="text-gray-500 text-sm mt-1">Informações da sua assinatura</p>
      </div>

      {/* Card do plano */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{assinatura.plano.nome}</h2>
            <p className="text-gray-500 mt-1">
              {assinatura.periodicidade === 'MENSAL'
                ? `R$ ${Number(assinatura.plano.valorMensal).toFixed(2)}/mês`
                : `R$ ${Number(assinatura.plano.valorAnual ?? 0).toFixed(2)}/ano`}
            </p>
            <p className="text-sm text-gray-500 mt-1">{assinatura.pontosContratados} pontos contratados</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
            assinatura.status === 'ATIVA' ? 'bg-green-100 text-green-700' :
            assinatura.status === 'TRIAL' ? 'bg-indigo-100 text-indigo-700' :
            assinatura.status === 'INADIMPLENTE' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            <Icon className="h-3.5 w-3.5" />
            {st.label}
          </span>
        </div>

        <div className="border-t pt-4 flex flex-wrap gap-6 text-sm text-gray-600">
          {assinatura.trialAteEm && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              <span>Trial até: <strong>{new Date(assinatura.trialAteEm).toLocaleDateString('pt-BR')}</strong></span>
            </div>
          )}
          {assinatura.proximaCobrancaEm && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>Próxima cobrança: <strong>{new Date(assinatura.proximaCobrancaEm).toLocaleDateString('pt-BR')}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Histórico */}
      <div className="card">
        <h2 className="font-heading font-semibold text-gray-800 mb-4">Histórico de cobranças</h2>
        {cobrancas.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhuma cobrança registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  {['Vencimento', 'Valor', 'Forma', 'Status'].map(h => (
                    <th key={h} className="pb-3 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {cobrancas.map(c => (
                  <tr key={c.id} className="text-gray-700">
                    <td className="py-3 pr-4">{new Date(c.vencimentoEm).toLocaleDateString('pt-BR')}</td>
                    <td className="pr-4">R$ {Number(c.valor).toFixed(2)}</td>
                    <td className="pr-4">{c.billingType}</td>
                    <td>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        c.status === 'CONFIRMADA' || c.status === 'RECEBIDA' ? 'bg-green-100 text-green-700' :
                        c.status === 'VENCIDA' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {COB_STATUS[c.status] ?? c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
