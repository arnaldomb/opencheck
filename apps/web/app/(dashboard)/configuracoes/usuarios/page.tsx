'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { ArrowLeft, Users, Plus, Loader2, Mail, Shield } from 'lucide-react'
import Link from 'next/link'

interface Usuario {
  id: string; nome: string; email: string; role: string; ativo: boolean
}

interface FormState { nome: string; email: string; senha: string; role: string }

const ROLE_LABEL: Record<string, string> = {
  admin:     'Administrador',
  operador:  'Operador',
  viewer:    'Visualizador',
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [erro, setErro]         = useState('')
  const [form, setForm] = useState<FormState>({ nome: '', email: '', senha: '', role: 'operador' })

  function set(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<Usuario[]>('/usuarios')
      setUsuarios(data)
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
      await apiFetch('/usuarios', { method: 'POST', body: JSON.stringify(form) })
      setShowForm(false)
      setForm({ nome: '', email: '', senha: '', role: 'operador' })
      load()
    } catch (err) {
      setErro(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/configuracoes" className="btn-ghost p-2 rounded-lg">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="font-heading font-bold text-2xl text-gray-900">Usuários</h1>
          <p className="text-gray-500 text-sm">{usuarios.length} usuário(s) na sua empresa</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Convidar usuário
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4">
          <h2 className="font-heading font-semibold text-gray-800">Novo usuário</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Nome *</label>
                <input className="input" required value={form.nome} onChange={e => set('nome', e.target.value)} />
              </div>
              <div>
                <label className="label">E-mail *</label>
                <input type="email" className="input" required value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label className="label">Senha inicial *</label>
                <input type="password" className="input" required value={form.senha} onChange={e => set('senha', e.target.value)} />
              </div>
              <div>
                <label className="label">Perfil</label>
                <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="admin">Administrador</option>
                  <option value="operador">Operador</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </div>
            </div>
            {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Criando...' : 'Criar usuário'}
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
        <div className="card p-0 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {usuarios.map(u => (
              <li key={u.id} className="px-6 py-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-ggtech-blue/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-ggtech-blue font-bold text-sm">{u.nome[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{u.nome}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Mail className="h-3.5 w-3.5" /> {u.email}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Shield className="h-3 w-3" />
                    {ROLE_LABEL[u.role] ?? u.role}
                  </div>
                  <span className={u.ativo ? 'badge-green' : 'badge-gray'}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
