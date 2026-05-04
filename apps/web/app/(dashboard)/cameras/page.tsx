'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { Camera, Loader2, Video, VideoOff, X, Maximize2, RefreshCw, ImageOff } from 'lucide-react'

interface Snapshot { id: string; imageUrl: string }

interface Cam {
  id: string
  deviceSerial: string
  deviceName: string | null
  channelNo: number
  ativa: boolean
  ponto: { id: string; nome: string } | null
  latestSnapshot: Snapshot | null
}

interface StreamData {
  hls:  string | null
  rtmp: string | null
  expireTime?: string
}

function StreamModal({ cam, onClose }: { cam: Cam; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream]   = useState<StreamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState('')

  useEffect(() => {
    apiFetch<StreamData>(`/cameras/${cam.id}/stream`)
      .then(setStream)
      .catch(err => setErro(String(err)))
      .finally(() => setLoading(false))
  }, [cam.id])

  useEffect(() => {
    const video = videoRef.current
    const url   = stream?.hls
    if (!video || !url) return

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.play().catch(() => {})
      return
    }

    let cleanup: (() => void) | undefined
    import('hls.js').then(({ default: Hls }) => {
      if (!Hls.isSupported()) { setErro('HLS não suportado neste navegador'); return }
      const hls = new Hls({ enableWorker: false })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setErro('Erro ao reproduzir stream')
      })
      cleanup = () => hls.destroy()
    })
    return () => cleanup?.()
  }, [stream])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">{cam.deviceName ?? cam.deviceSerial}</p>
            {cam.ponto && <p className="text-xs text-gray-500">{cam.ponto.nome}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="bg-black aspect-video flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-white/60">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Conectando ao stream…</p>
            </div>
          )}
          {erro && !loading && (
            <div className="text-center text-white/70 space-y-2 px-6">
              <p className="text-sm">{erro}</p>
              {stream?.rtmp && (
                <p className="text-xs">URL RTMP: <span className="font-mono break-all text-white/50">{stream.rtmp}</span></p>
              )}
            </div>
          )}
          {stream?.hls && !erro && (
            <video ref={videoRef} className="w-full h-full" controls muted playsInline />
          )}
        </div>

        {stream?.expireTime && (
          <div className="px-5 py-2 text-xs text-gray-400 border-t border-gray-100">
            Stream expira em: {stream.expireTime}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CamerasPage() {
  const [cameras, setCameras]     = useState<Cam[]>([])
  const [status, setStatus]       = useState<Record<string, boolean>>({})
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [streaming, setStreaming] = useState<Cam | null>(null)
  const [capturing, setCapturing] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await apiFetch<Record<string, boolean>>('/cameras/status')
      setStatus(s)
    } catch {}
  }, [])

  async function load() {
    setLoading(true)
    try {
      const cams = await apiFetch<Cam[]>('/cameras')
      setCameras(cams)
      await loadStatus()
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    await loadStatus()
    setRefreshing(false)
  }

  async function captureSnapshot(e: React.MouseEvent, cam: Cam) {
    e.stopPropagation()
    setCapturing(cam.id)
    try {
      const snap = await apiFetch<Snapshot>(`/cameras/${cam.id}/snapshot`, { method: 'POST' })
      setCameras(prev => prev.map(c => c.id === cam.id ? { ...c, latestSnapshot: snap } : c))
    } catch {}
    setCapturing(null)
  }

  useEffect(() => {
    load()
    const interval = setInterval(loadStatus, 30_000)
    return () => clearInterval(interval)
  }, [loadStatus])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-gray-900">Câmeras</h1>
          <p className="text-gray-500 text-sm mt-1">{cameras.length} câmera(s) cadastrada(s)</p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar status
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ggtech-blue border-t-transparent" />
        </div>
      ) : cameras.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <Camera className="h-12 w-12 text-gray-200" />
          <p className="font-medium">Nenhuma câmera cadastrada</p>
          <p className="text-sm">Adicione câmeras em Configurações → Câmeras EZVIZ</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map(cam => {
            const online  = status[cam.deviceSerial] ?? false
            const snap    = cam.latestSnapshot
            const isCap   = capturing === cam.id
            return (
              <div
                key={cam.id}
                className="card p-0 overflow-hidden hover:shadow-md hover:border-ggtech-blue/30 transition-all"
              >
                {/* Snapshot / preview area */}
                <div className="relative h-40 bg-gray-900 group">
                  {snap ? (
                    <img
                      src={snap.imageUrl}
                      alt="snapshot"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {online
                        ? <Video className="h-8 w-8 text-white/20" />
                        : <VideoOff className="h-8 w-8 text-white/10" />
                      }
                    </div>
                  )}

                  {/* Overlay buttons */}
                  <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                    {online && (
                      <button
                        onClick={() => setStreaming(cam)}
                        className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-900 text-xs font-medium px-3 py-1.5 rounded-lg shadow transition-colors"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        Ver ao vivo
                      </button>
                    )}
                    <button
                      onClick={e => captureSnapshot(e, cam)}
                      disabled={isCap}
                      className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-900 text-xs font-medium px-3 py-1.5 rounded-lg shadow transition-colors disabled:opacity-60"
                    >
                      {isCap
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RefreshCw className="h-3.5 w-3.5" />
                      }
                      Capturar
                    </button>
                  </div>

                  {/* No snapshot hint */}
                  {!snap && !online && (
                    <div className="absolute bottom-1 left-0 right-0 flex justify-center">
                      <span className="text-xs text-white/30 flex items-center gap-1">
                        <ImageOff className="h-3 w-3" /> sem captura
                      </span>
                    </div>
                  )}
                </div>

                {/* Info row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {cam.deviceName ?? cam.deviceSerial}
                    </p>
                    <p className="font-mono text-xs text-gray-400">{cam.deviceSerial}</p>
                    {cam.ponto && <p className="text-xs text-gray-500 mt-0.5">{cam.ponto.nome}</p>}
                  </div>
                  <span className={`ml-3 flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {streaming && (
        <StreamModal cam={streaming} onClose={() => setStreaming(null)} />
      )}
    </div>
  )
}
