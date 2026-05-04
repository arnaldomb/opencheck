'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react'

export default function EsqueciSenhaPage() {
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [enviado, setEnviado]   = useState(false)
  const [erro, setErro]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/esqueci-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        setErro(data.error ?? 'Erro ao enviar e-mail')
        return
      }
      setEnviado(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8">
        {enviado ? (
          <div className="text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="font-heading font-bold text-xl text-gray-900">E-mail enviado!</h2>
            <p className="text-gray-500 text-sm">
              Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
            </p>
            <Link href="/login" className="btn-primary inline-flex items-center gap-2 mt-2">
              <ArrowLeft className="h-4 w-4" /> Voltar ao login
            </Link>
          </div>
        ) : (
          <>
            <h2 className="font-heading font-bold text-2xl text-gray-900 mb-1">Recuperar senha</h2>
            <p className="text-gray-500 text-sm mb-6">
              Informe seu e-mail e enviaremos um link para redefinir sua senha.
            </p>

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

              {erro && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {erro}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <Link href="/login" className="text-sm text-ggtech-blue hover:text-ggtech-darkblue inline-flex items-center gap-1 transition-colors">
                <ArrowLeft className="h-3 w-3" /> Voltar ao login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
