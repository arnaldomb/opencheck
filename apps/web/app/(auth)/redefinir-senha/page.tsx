'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Loader2, CheckCircle } from 'lucide-react'

function RedefinirSenhaForm() {
  const router    = useRouter()
  const params    = useSearchParams()
  const token     = params.get('token') ?? ''
  const [senha, setSenha]       = useState('')
  const [confirma, setConfirma] = useState('')
  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState('')
  const [ok, setOk]             = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (senha !== confirma) { setErro('As senhas não coincidem'); return }
    if (senha.length < 8)   { setErro('Mínimo de 8 caracteres'); return }
    setLoading(true)
    setErro('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      })
      if (!res.ok) {
        const data = await res.json()
        setErro(data.error ?? 'Link inválido ou expirado')
        return
      }
      setOk(true)
      setTimeout(() => router.push('/login'), 2500)
    } finally {
      setLoading(false)
    }
  }

  if (ok) return (
    <div className="text-center space-y-4">
      <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
      <h2 className="font-heading font-bold text-xl text-gray-900">Senha redefinida!</h2>
      <p className="text-gray-500 text-sm">Redirecionando para o login...</p>
    </div>
  )

  return (
    <>
      <h2 className="font-heading font-bold text-2xl text-gray-900 mb-1">Nova senha</h2>
      <p className="text-gray-500 text-sm mb-6">Escolha uma senha segura de pelo menos 8 caracteres.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nova senha</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="password" className="input pl-9" placeholder="••••••••" value={senha} required onChange={e => setSenha(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Confirmar senha</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="password" className="input pl-9" placeholder="••••••••" value={confirma} required onChange={e => setConfirma(e.target.value)} />
          </div>
        </div>
        {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Salvando...' : 'Redefinir senha'}
        </button>
      </form>
    </>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <Suspense fallback={<div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent mx-auto" />}>
          <RedefinirSenhaForm />
        </Suspense>
      </div>
    </div>
  )
}
