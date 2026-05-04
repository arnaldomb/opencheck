'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { ArrowLeft, Camera, Loader2, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface CameraItem {
  id: string
  deviceSerial: string
  deviceName: string | null
  channelNo: number
  pontoId: string | null
  ponto: { id: string; nome: string } | null
}

interface Ponto {
  id: string
  nome: string
}

const EMPTY_FORM = { deviceSerial: '', deviceName: '', channelNo: 1, pontoId: '' }

export default function EzvizPage() {
  const [cameras, setCameras] = useState<CameraItem[]>([])
  const [pontos, setPontos]   = useState<Ponto[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding]   = useState(false)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [erro, setErro]       = useState('')
  const [ok, setOk]           = useState(false)

  function setF<K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function load() {
    const [cams, pts] = await Promise.all([
      apiFetch<CameraItem[]>('/configuracoes/cameras'),
      apiFetch<Ponto[]>('/pontos'),
    ])
    setCameras(cams)
    setPontos(pts)
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true); setErro(''); setOk(false)
    try {
      await apiFetch('/configuracoes/cameras', {
        method: 'POST',
        body: JSON.stringify({
          deviceSerial: form.deviceSerial.trim(),
          deviceName:   form.deviceName.trim() || undefined,
          channelNo:    form.channelNo,
          pontoId:      form.pontoId || undefined,
        }),
      })
      setForm(EMPTY_FORM)
      setOk(true)
      await load()
    } catch (err) {
      setErro(String(err))
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta câmera?')) return
    try {
      await apiFetch(`/configuracoes/cameras/${id}`, { method: 'DELETE' })
      setCameras(c => c.filter(cam => cam.id !== id))
    } catch {}
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
    </div>
  )

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/configuracoes" className="btn-ghost p-2 rounded-lg">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Câmeras EZVIZ</h1>
          <p className="text-gray-500 text-sm">Vincule câmeras pelo serial do dispositivo</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        As credenciais de API EZVIZ são configuradas pelo administrador do sistema.
        Aqui você vincula câmeras ao seu tenant informando o <strong>serial do dispositivo</strong>.
      </div>

      {/* Add camera form */}
      <form onSubmit={handleAdd} className="card space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <Plus className="h-4 w-4 text-ggtech-blue" />
          <h2 className="font-heading font-semibold text-gray-800">Adicionar câmera</h2>
        </div>

        <div>
          <label className="label">Serial do dispositivo *</label>
          <input
            required
            className="input font-mono"
            placeholder="Ex: C12345678"
            value={form.deviceSerial}
            onChange={e => setF('deviceSerial', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nome (opcional)</label>
            <input
              className="input"
              placeholder="Ex: Câmera Portaria"
              value={form.deviceName}
              onChange={e => setF('deviceName', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Canal</label>
            <input
              type="number"
              min={1}
              className="input"
              value={form.channelNo}
              onChange={e => setF('channelNo', Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="label">Ponto de vigilância</label>
          <select
            className="input"
            value={form.pontoId}
            onChange={e => setF('pontoId', e.target.value)}
          >
            <option value="">— Sem vínculo —</option>
            {pontos.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}
        {ok   && <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">Câmera adicionada com sucesso!</div>}

        <button type="submit" disabled={adding} className="btn-primary flex items-center gap-2 px-4 py-2">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {adding ? 'Adicionando...' : 'Adicionar câmera'}
        </button>
      </form>

      {/* Camera list */}
      {cameras.length > 0 ? (
        <div className="card space-y-1">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Camera className="h-4 w-4 text-ggtech-blue" />
            <h2 className="font-heading font-semibold text-gray-800">Câmeras cadastradas</h2>
            <span className="ml-auto text-xs text-gray-400">{cameras.length} câmera{cameras.length !== 1 ? 's' : ''}</span>
          </div>
          {cameras.map(cam => (
            <div key={cam.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-mono text-sm font-medium text-gray-900">{cam.deviceSerial}</p>
                <p className="text-xs text-gray-500">
                  {cam.deviceName && <span>{cam.deviceName} · </span>}
                  Canal {cam.channelNo}
                  {cam.ponto && <span className="ml-1 text-ggtech-blue">· {cam.ponto.nome}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(cam.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-gray-400 text-sm">
          Nenhuma câmera cadastrada ainda.
        </div>
      )}
    </div>
  )
}
