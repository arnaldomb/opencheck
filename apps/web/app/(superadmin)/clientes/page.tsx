'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import Link from 'next/link'
import { Building2, Plus, Search } from 'lucide-react'

interface Cliente {
  id: string; nome: string; email: string; cnpj?: string
  assinatura?: { status: string; plano: { nome: string }; pontosContratados: number }
}

const STATUS_CFG: Record<string, string> = {
  TRIAL:        'badge-blue',
  ATIVA:        'badge-green',
  INADIMPLENTE: 'badge-yellow',
  SUSPENSA:     'badge-red',
  CANCELADA:    'badge-gray',
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading]   = useState(true)
  const [busca, setBusca]       = useState('')

  useEffect(() => {
    apiFetch<Cliente[]>('/superadmin/clientes')
      .then(setClientes)
      .finally(() => setLoading(false))
  }, [])

  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    c.email.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">{clientes.length} empresa(s) cadastrada(s)</p>
        </div>
        <Link href="/clientes/novo" className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo cliente
        </Link>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          className="input pl-9"
          placeholder="Buscar por nome ou e-mail..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <Building2 className="h-12 w-12 text-gray-200" />
          <p className="font-medium">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Plano</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Pontos</th>
                <th className="text-left px-6 py-3 font-medium text-gray-600">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map(c => {
                const ass = c.assinatura
                const cls = STATUS_CFG[ass?.status ?? ''] ?? 'badge-gray'
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">{c.nome}</p>
                      <p className="text-gray-400 text-xs">{c.email}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{ass?.plano.nome ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-600">{ass?.pontosContratados ?? 0}</td>
                    <td className="px-6 py-4">
                      {ass && <span className={cls}>{ass.status}</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/clientes/${c.id}`} className="text-ggtech-blue hover:text-ggtech-darkblue text-xs font-medium">
                        Ver detalhes →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
