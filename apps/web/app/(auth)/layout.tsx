import { Shield } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-ggtech-darkblue to-ggtech-blue flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <Shield className="h-10 w-10 text-white" />
        <h1 className="text-white font-heading font-bold text-2xl">OpenCheck</h1>
        <p className="text-blue-200 text-sm">Plataforma de conformidade operacional</p>
      </div>
      {children}
    </div>
  )
}
