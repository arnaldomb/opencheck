'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface OnboardingStep {
  ponto: boolean; vigilante: boolean; ciclo: boolean; notificacao: boolean; teste: boolean
}

const PASSOS = [
  { key: 'ponto', label: 'Criar primeiro ponto', href: '/pontos/novo', desc: 'Cadastre uma portaria ou guarita' },
  { key: 'vigilante', label: 'Cadastrar vigilante', href: '/vigilantes', desc: 'Adicione o vigilante responsável pelo ponto' },
  { key: 'ciclo', label: 'Configurar ciclo de alerta', href: '/pontos', desc: 'Defina a duração e tolerância do ciclo' },
  { key: 'notificacao', label: 'Configurar notificações', href: '/configuracoes/notificacoes', desc: 'WhatsApp ou CTRL+SAFE' },
  { key: 'teste', label: 'Realizar teste', href: '/pontos', desc: 'Inicie um ciclo e faça o check-in' },
] as const

export default function OnboardingPage() {
  const router = useRouter()
  const [steps, setSteps] = useState<OnboardingStep | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/onboarding`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(data => {
      setSteps(data)
      if (data?.ponto && data?.vigilante && data?.ciclo && data?.notificacao && data?.teste) {
        router.push('/dashboard/overview')
      }
    })
  }, [router])

  if (!steps) return <p>Carregando...</p>

  const concluidos = PASSOS.filter(p => steps[p.key]).length

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: 32 }}>
      <h1>Bem-vindo ao Alerta Vigia</h1>
      <p>Complete os 5 passos para começar a usar a plataforma.</p>
      <p>{concluidos}/5 concluídos</p>

      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PASSOS.map((passo, i) => (
          <li key={passo.key} style={{
            padding: 16, border: '1px solid', borderRadius: 8,
            borderColor: steps[passo.key] ? 'green' : '#ccc',
            opacity: steps[passo.key] ? 0.7 : 1,
          }}>
            <strong>{i + 1}. {passo.label}</strong>
            {steps[passo.key] ? ' ✓' : (
              <>
                <p style={{ margin: '4px 0' }}>{passo.desc}</p>
                <a href={passo.href}>Configurar →</a>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
