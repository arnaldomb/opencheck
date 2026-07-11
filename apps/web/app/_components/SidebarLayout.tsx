'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, MapPin, Users, Bell,
  FileText, Settings, LogOut,
  Building2, DollarSign, Package, ChevronRight,
  Shield, LayoutGrid, ShieldCheck,
} from 'lucide-react'

const NAV_USER = [
  { href: '/overview',      label: 'Visão Geral',    icon: LayoutDashboard },
  { href: '/sinotico',      label: 'Sinótico',       icon: LayoutGrid },
  { href: '/pontos',        label: 'Pontos',         icon: MapPin },
  { href: '/operadores',    label: 'Operadores',     icon: Users },
  { href: '/supervisores',  label: 'Supervisores',   icon: ShieldCheck },
  { href: '/eventos',       label: 'Eventos',        icon: Bell },
  { href: '/relatorios',    label: 'Relatórios',     icon: FileText },
  { href: '/configuracoes', label: 'Configurações',  icon: Settings },
]

const NAV_SUPERADMIN = [
  { href: '/overview',       label: 'Visão Geral',   icon: LayoutDashboard },
  { href: '/clientes',       label: 'Clientes',      icon: Building2 },
  { href: '/planos',         label: 'Planos',        icon: Package },
  { href: '/financeiro',     label: 'Financeiro',    icon: DollarSign },
  { href: '/eventos-config', label: 'Cód. Eventos',  icon: Bell },
]

interface Props {
  children: React.ReactNode
}

export default function SidebarLayout({ children }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const [role, setRole]     = useState<string | null>(null)
  const [tenant, setTenant] = useState<string>('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.replace('/login'); return }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const r = payload.role ?? 'user'
      setRole(r)
      setTenant(payload.tenantNome ?? payload.email ?? '')
      if (r !== 'superadmin') {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/configuracoes/logo`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(res => res.json())
          .then(d => setLogoUrl(d.logoUrl ?? null))
          .catch(() => {})
      }
    } catch {
      router.replace('/login')
    }
  }, [router])

  if (!role) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  const nav = role === 'superadmin' ? NAV_SUPERADMIN : NAV_USER

  function isActive(href: string) {
    if (href === '/overview') return pathname === '/overview'
    return pathname === href || pathname.startsWith(href + '/')
  }

  function logout() {
    localStorage.clear()
    router.replace('/login')
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-ggtech-darkblue flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-ggtech-lightblue" />
            <span className="text-white font-heading font-bold text-lg">OpenCheck</span>
          </div>
          {role === 'superadmin' && (
            <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-ggtech-blue/30 text-blue-200">
              Superadmin
            </span>
          )}
        </div>

        {/* Tenant name / logo */}
        {tenant && (
          <div className="px-6 py-3 border-b border-white/10">
            {logoUrl ? (
              <div className="space-y-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={tenant} className="max-h-12 max-w-full object-contain" />
                <p className="text-white/50 text-xs font-medium truncate">{tenant}</p>
              </div>
            ) : (
              <>
                <p className="text-white/40 text-xs uppercase tracking-wider">Empresa</p>
                <p className="text-white/80 text-sm font-medium truncate">{tenant}</p>
              </>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(item => {
            const Icon   = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
                  active
                    ? 'bg-ggtech-blue text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${active ? 'text-white' : 'text-white/50 group-hover:text-white'}`} />
                {item.label}
                {active && <ChevronRight className="ml-auto h-3 w-3" />}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        <main className="flex-1 p-8 bg-gray-50 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
