import Link from 'next/link'
import { Bell, Zap, Users, ChevronRight, Settings } from 'lucide-react'

const ITEMS = [
  {
    href: '/configuracoes/notificacoes',
    icon: Bell,
    label: 'Notificações',
    desc: 'Configure WhatsApp e canais de alerta por ponto',
  },
  {
    href: '/configuracoes/ezviz',
    icon: Zap,
    label: 'Integração EZVIZ',
    desc: 'Credenciais e configurações de câmeras EZVIZ',
  },
  {
    href: '/configuracoes/usuarios',
    icon: Users,
    label: 'Usuários',
    desc: 'Gerencie usuários e permissões da sua empresa',
  },
]

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-gray-900">Configurações</h1>
        <p className="text-gray-500 text-sm mt-1">Personalize a plataforma para sua empresa</p>
      </div>

      <div className="card p-0 overflow-hidden divide-y divide-gray-100">
        {ITEMS.map(item => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 px-6 py-5 hover:bg-gray-50 transition-colors group"
            >
              <div className="p-2.5 rounded-xl bg-ggtech-blue/10 group-hover:bg-ggtech-blue/20 transition-colors">
                <Icon className="h-5 w-5 text-ggtech-blue" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{item.label}</p>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-ggtech-blue transition-colors" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
