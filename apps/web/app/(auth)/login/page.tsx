'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [erro, setErro]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      })

      if (!res.ok) {
        const data = await res.json()
        setErro(data.error ?? 'Credenciais inválidas')
        return
      }

      const { token, refresh } = await res.json()
      localStorage.setItem('token', token)
      localStorage.setItem('refresh', refresh)

      router.push('/overview')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        <h2 className="font-heading font-bold text-2xl text-gray-900 mb-1">Entrar</h2>
        <p className="text-gray-500 text-sm mb-6">Acesse sua conta para continuar</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                className="input pl-9"
                placeholder="seu@email.com"
                value={email}
                required
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="password"
                className="input pl-9"
                placeholder="••••••••"
                value={senha}
                required
                onChange={e => setSenha(e.target.value)}
              />
            </div>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {erro}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/esqueci-senha" className="text-sm text-ggtech-blue hover:text-ggtech-darkblue transition-colors">
            Esqueci minha senha
          </Link>
        </div>
      </div>
    </div>
  )
}
