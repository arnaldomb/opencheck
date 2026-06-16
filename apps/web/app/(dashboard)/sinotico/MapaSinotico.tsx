'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'
import { Search, Maximize2, Minimize2, X } from 'lucide-react'

type StatusSinotico = 'ABERTA' | 'FECHADA' | 'PENDENTE' | 'AUSENTE' | 'FECHAMENTO_PENDENTE' | 'SEM_CONFIGURACAO'

interface PontoSinotico {
  pontoId: string
  nome: string
  endereco: string | null
  latitude: number | null
  longitude: number | null
  statusAtual: StatusSinotico
  horaAbertura: string | null
  horaFechamento: string | null
  abertaEm: string | null
  operadorAbertura: string | null
}

const STATUS_COLOR: Record<StatusSinotico, { fill: string; label: string }> = {
  ABERTA:              { fill: '#22c55e', label: 'Aberta' },
  FECHADA:             { fill: '#94a3b8', label: 'Fechada' },
  PENDENTE:            { fill: '#eab308', label: 'Aguardando abertura' },
  AUSENTE:             { fill: '#ef4444', label: 'Não abriu' },
  FECHAMENTO_PENDENTE: { fill: '#f97316', label: 'Fechamento pendente' },
  SEM_CONFIGURACAO:    { fill: '#d1d5db', label: 'Sem configuração' },
}

function makeIcon(status: StatusSinotico, pulse: boolean) {
  const { fill } = STATUS_COLOR[status]
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      ${pulse ? `<circle cx="16" cy="14" r="13" fill="${fill}" opacity="0.3">
        <animate attributeName="r" values="10;16;10" dur="1.8s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite"/>
      </circle>` : ''}
      <circle cx="16" cy="14" r="10" fill="${fill}" stroke="white" stroke-width="2.5"/>
      <polygon points="10,22 22,22 16,34" fill="${fill}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -42],
  })
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function FitBounds({ pontos }: { pontos: PontoSinotico[] }) {
  const map = useMap()
  useEffect(() => {
    const coords = pontos
      .filter(p => p.latitude !== null && p.longitude !== null)
      .map(p => [p.latitude!, p.longitude!] as [number, number])
    if (coords.length === 0) return
    if (coords.length === 1) {
      map.setView(coords[0], 15)
    } else {
      map.fitBounds(L.latLngBounds(coords), { padding: [48, 48] })
    }
  }, [map, pontos])
  return null
}

interface Props {
  pontos: PontoSinotico[]
}

export default function MapaSinotico({ pontos }: Props) {
  const [busca, setBusca]           = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const containerRef                = useRef<HTMLDivElement>(null)

  const coordValida = (lat: number | null, lng: number | null) =>
    lat !== null && lng !== null &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180

  const comCoordenadas = pontos.filter(p => coordValida(p.latitude, p.longitude))
  const semCoordenadas = pontos.length - comCoordenadas.length

  const filtrados = comCoordenadas.filter(p =>
    busca.trim() === '' ||
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.endereco ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const defaultCenter: [number, number] = [-14.235, -51.9253]

  return (
    <div className="space-y-2">
      {semCoordenadas > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {semCoordenadas} ponto{semCoordenadas > 1 ? 's' : ''} sem coordenadas — configure latitude e longitude na{' '}
          <Link href="/pontos" className="underline font-medium">página do ponto</Link>.
        </p>
      )}

      {comCoordenadas.length === 0 ? (
        <div className="h-[520px] flex items-center justify-center bg-gray-100 rounded-xl border border-gray-200 text-gray-400 text-sm">
          Nenhum ponto com coordenadas cadastradas.
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative rounded-xl overflow-hidden border border-gray-200"
          style={{ background: '#f3f4f6' }}
        >
          {/* Barra de busca sobreposta */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-72 max-w-[calc(100%-5rem)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar loja..."
                className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-200 bg-white/95 backdrop-blur-sm text-sm shadow-md focus:outline-none focus:ring-2 focus:ring-ggtech-blue"
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {busca && (
              <p className="text-xs text-center mt-1 text-white drop-shadow font-medium">
                {filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Botão tela cheia */}
          <button
            onClick={toggleFullscreen}
            title={fullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
            className="absolute top-3 right-3 z-[1000] flex items-center justify-center w-9 h-9 rounded-lg bg-white/95 backdrop-blur-sm border border-gray-200 shadow-md text-gray-600 hover:text-gray-900 hover:bg-white transition-colors"
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <MapContainer
            center={defaultCenter}
            zoom={5}
            style={{ height: fullscreen ? '100vh' : '520px', zIndex: 0 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds pontos={filtrados.length > 0 ? filtrados : comCoordenadas} />
            {filtrados.map(p => {
              const pulse = p.statusAtual === 'AUSENTE' || p.statusAtual === 'FECHAMENTO_PENDENTE'
              const cfg = STATUS_COLOR[p.statusAtual]
              return (
                <Marker
                  key={p.pontoId}
                  position={[p.latitude!, p.longitude!]}
                  icon={makeIcon(p.statusAtual, pulse)}
                >
                  <Popup minWidth={200}>
                    <div className="space-y-1 text-sm">
                      <p className="font-bold text-gray-900 text-base leading-tight">{p.nome}</p>
                      {p.endereco && <p className="text-gray-500 text-xs">{p.endereco}</p>}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: cfg.fill + '22', color: cfg.fill }}
                      >
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: cfg.fill }} />
                        {cfg.label}
                      </span>
                      <div className="text-xs text-gray-500 pt-1 space-y-0.5">
                        {p.horaAbertura   && <p>Abertura: <strong>{p.horaAbertura}</strong></p>}
                        {p.abertaEm       && <p>Aberta às: <strong>{fmt(p.abertaEm)}</strong>{p.operadorAbertura ? ` · ${p.operadorAbertura}` : ''}</p>}
                        {p.horaFechamento && <p>Fechamento: <strong>{p.horaFechamento}</strong></p>}
                      </div>
                      <a href={`/pontos/${p.pontoId}`} className="block text-xs text-blue-600 hover:underline pt-1 font-medium">
                        Configurar ponto →
                      </a>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </div>
      )}

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 pt-1">
        {(Object.entries(STATUS_COLOR) as [StatusSinotico, { fill: string; label: string }][]).map(([, cfg]) => (
          <div key={cfg.label} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: cfg.fill }} />
            {cfg.label}
          </div>
        ))}
      </div>
    </div>
  )
}
