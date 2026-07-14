'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { ArrowLeft, Package, CheckCircle, Clock, AlertCircle, XCircle, Loader2 } from 'lucide-react'

interface Pacote {
  id: string; nome: string; faixaMin: number; faixaMax?: number | null; precoConta?: number | null; ordem: number
}

interface Assinatura {
  status: string; periodicidade: string; pontosContratados: number
  proximaCobrancaEm?: string | null; trialAteEm?: string | null
  planoId: string
  diaVencimento?: number | null
  plano: { id: string; nome: string; precoConta?: number | null }
}

const STATUS_MAP: Record<string, { label: string; Icon: React.ElementType; cls: string }> = {
  TRIAL:        { label: 'Trial',        Icon: Clock,       cls: 'bg-indigo-100 text-indigo-700' },
  ATIVA:        { label: 'Ativa',        Icon: CheckCircle, cls: 'bg-green-100 text-green-700' },
  INADIMPLENTE: { label: 'Inadimplente', Icon: AlertCircle, cls: 'bg-yellow-100 text-yellow-700' },
  SUSPENSA:     { label: 'Suspensa',     Icon: XCircle,     cls: 'bg-red-100 text-red-700' },
  CANCELADA:    { label: 'Cancelada',    Icon: XCircle,     cls: 'bg-gray-100 text-gray-600' },
}

function faixaLabel(p: Pacote) {
  return p.faixaMax != null ? `${p.faixaMin} a ${p.faixaMax}` : `acima de ${p.faixaMin - 1}`
}

export default function PlanoPage() {
  const [pacotes, setPacotes]       = useState<Pacote[]>([])
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch<Pacote[]>('/plano/pacotes').catch(() => []),
      apiFetch<Assinatura | null>('/plano').catch(() => null),
    ]).then(([p, a]) => {
      setPacotes(Array.isArray(p) ? [...p].sort((x, y) => x.ordem - y.ordem) : [])
      setAssinatura(a?.plano ? a : null)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
      </div>
    )
  }

  const st = assinatura ? (STATUS_MAP[assinatura.status] ?? STATUS_MAP.CANCELADA) : null
  const valorMensal = assinatura?.plano.precoConta != null
    ? Number(assinatura.plano.precoConta) * assinatura.pontosContratados
    : null

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/configuracoes" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Plano contratado</h1>
          <p className="text-gray-500 text-sm mt-1">Mensalidade da plataforma OpenCheck</p>
        </div>
      </div>

      {assinatura && st && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">{assinatura.plano.nome}</h3>
              <p className="text-gray-500 text-sm">{assinatura.pontosContratados} conta(s) contratada(s)</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${st.cls}`}>
              <st.Icon className="h-3.5 w-3.5" /> {st.label}
            </span>
          </div>
          <div className="border-t pt-3 flex flex-wrap gap-6 text-sm text-gray-600">
            {valorMensal != null && (
              <div><span className="text-gray-400">Mensalidade: </span><strong>R$ {valorMensal.toFixed(2)}</strong></div>
            )}
            {assinatura.trialAteEm && (
              <div><span className="text-gray-400">Trial até: </span><strong>{new Date(assinatura.trialAteEm).toLocaleDateString('pt-BR')}</strong></div>
            )}
            {assinatura.proximaCobrancaEm && (
              <div><span className="text-gray-400">Próxima cobrança: </span><strong>{new Date(assinatura.proximaCobrancaEm).toLocaleDateString('pt-BR')}</strong></div>
            )}
            {assinatura.diaVencimento && (
              <div><span className="text-gray-400">Vencimento: </span><strong>todo dia {assinatura.diaVencimento}</strong></div>
            )}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-heading font-semibold text-gray-800">Mensalidade da Plataforma</h2>
          <p className="text-sm text-gray-500 mt-1">Preço unitário por conta em cada faixa do plano OpenCheck</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Plano</th>
                <th className="px-6 py-3">Faixa de contas</th>
                <th className="px-6 py-3">Preço/conta/mês</th>
              </tr>
            </thead>
            <tbody>
              {pacotes.map(p => {
                const contratado = assinatura?.planoId === p.id
                return (
                  <tr key={p.id} className={`border-b border-gray-50 last:border-0 ${contratado ? 'bg-green-50/60' : ''}`}>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-2 font-medium ${contratado ? 'text-green-700' : 'text-gray-800'}`}>
                        <Package className={`h-4 w-4 ${contratado ? 'text-green-600' : 'text-gray-300'}`} />
                        {p.nome}
                        {contratado && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">plano contratado</span>}
                      </span>
                    </td>
                    <td className={`px-6 py-4 ${contratado ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{faixaLabel(p)}</td>
                    <td className={`px-6 py-4 ${contratado ? 'text-green-700 font-semibold' : 'text-gray-800'}`}>
                      {p.precoConta != null ? `R$ ${Number(p.precoConta).toFixed(2)}` : 'Negociado'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
