import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OpenCheck',
  description: 'Plataforma de conformidade de abertura e verificação de operadores',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
