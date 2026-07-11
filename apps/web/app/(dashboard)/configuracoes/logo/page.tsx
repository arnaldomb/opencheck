'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { ArrowLeft, ImageIcon, Loader2, Save, Trash2, Upload, CheckCircle2 } from 'lucide-react'

const MAX_BYTES = 500 * 1024

export default function LogoPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [logoAtual, setLogoAtual] = useState<string | null>(null)
  const [preview, setPreview]     = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [ok, setOk]               = useState(false)
  const [erro, setErro]           = useState('')

  useEffect(() => {
    apiFetch<{ logoUrl: string | null }>('/configuracoes/logo')
      .then(d => setLogoAtual(d.logoUrl))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErro(''); setOk(false)
    const file = e.target.files?.[0]
    if (!file) return
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setErro('Formato inválido — use PNG, JPEG ou WebP.')
      return
    }
    if (file.size > MAX_BYTES) {
      setErro('Arquivo muito grande — máximo de 500KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPreview(String(reader.result))
    reader.readAsDataURL(file)
  }

  async function salvar() {
    if (!preview) return
    setSaving(true); setErro(''); setOk(false)
    try {
      await apiFetch('/configuracoes/logo', { method: 'PUT', body: JSON.stringify({ logo: preview }) })
      setLogoAtual(preview)
      setPreview(null)
      setOk(true)
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => setOk(false), 3000)
    } catch (err) {
      setErro(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function remover() {
    if (!confirm('Remover a logo? O painel e os relatórios voltarão ao padrão OpenCheck.')) return
    setRemovendo(true); setErro('')
    try {
      await apiFetch('/configuracoes/logo', { method: 'DELETE' })
      setLogoAtual(null); setPreview(null)
    } catch (err) {
      setErro(String(err))
    } finally {
      setRemovendo(false)
    }
  }

  const exibida = preview ?? logoAtual

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-ggtech-blue transition-colors mb-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Configurações
        </Link>
        <h1 className="font-heading font-bold text-2xl text-gray-900">Logotipo da empresa</h1>
        <p className="text-gray-500 text-sm mt-1">
          A logo aparece no menu lateral do painel e no cabeçalho dos relatórios em PDF.
        </p>
      </div>

      <div className="card space-y-5">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-ggtech-blue" />
          </div>
        ) : (
          <>
            {/* Preview */}
            <div className="flex items-center justify-center h-36 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden">
              {exibida ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={exibida} alt="Logo da empresa" className="max-h-28 max-w-[80%] object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-300">
                  <ImageIcon className="h-10 w-10" />
                  <p className="text-xs">Nenhuma logo cadastrada</p>
                </div>
              )}
            </div>
            {preview && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Prévia — clique em &quot;Salvar logo&quot; para aplicar.
              </p>
            )}

            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />

            {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
            {ok && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Logo salva com sucesso!
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button onClick={() => fileRef.current?.click()} className="btn-outline flex items-center gap-2">
                <Upload className="h-4 w-4" /> Escolher imagem
              </button>
              {preview && (
                <button onClick={salvar} disabled={saving} className="btn-primary flex items-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Salvando...' : 'Salvar logo'}
                </button>
              )}
              {logoAtual && !preview && (
                <button onClick={remover} disabled={removendo} className="btn-ghost text-red-500 hover:bg-red-50 flex items-center gap-2">
                  {removendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remover logo
                </button>
              )}
            </div>

            <p className="text-xs text-gray-400">
              PNG, JPEG ou WebP · máximo 500KB · fundo transparente (PNG) fica melhor no menu escuro.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
