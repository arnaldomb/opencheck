'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import { FileText, Download, Loader2, Calendar, FileSpreadsheet, Building2, MapPin, AlertTriangle, CheckCircle, Activity } from 'lucide-react'

interface Ponto { id: string; nome: string; endereco?: string }

interface RelatorioDados {
  geradoEm: string
  empresa: { id: string; nome: string }
  periodo: { de: string; ate: string }
  pontos: Ponto[]
  resumo: {
    totalCiclos: number; ciclosConcluidos: number; ciclosAlerta: number
    totalEventos: number; totalCheckins: number; totalAlertas: number
    taxaCumprimento: number
  }
  eventos: {
    id: string; tipo: string; codigoEvento: string | null; ponto: string
    vigilante: string; ocorridoEm: string; encaminhado: boolean; monitorado: boolean
  }[]
  ciclos: {
    id: string; ponto: string; status: string
    iniciadoEm: string; finalizadoEm: string | null; checkinEm: string | null
  }[]
}

const TIPO_PT: Record<string, string> = {
  CHECKIN: 'Check-in', FALHA: 'Falha', PANICO: 'Pânico',
  PANICO_SILENCIOSO: 'Pânico silencioso', COACAO: 'Coação',
}
const STATUS_PT: Record<string, string> = {
  CONCLUIDO: 'Concluído', ALERTA: 'Alerta', CANCELADO: 'Cancelado', EM_ANDAMENTO: 'Em andamento',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function gerarPDF(dados: RelatorioDados) {
  const { default: jsPDF }   = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W   = doc.internal.pageSize.getWidth()
  const blue = [0, 82, 204] as [number, number, number]
  const gray = [100, 100, 100] as [number, number, number]

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFillColor(...blue)
  doc.rect(0, 0, W, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('OpenCheck', 12, 10)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Relatório de Ciclos e Eventos', 12, 17)

  doc.setFontSize(9)
  doc.text(`${dados.empresa.nome}`, W - 12, 10, { align: 'right' })
  doc.text(`Período: ${fmtDate(dados.periodo.de + 'T12:00:00')} a ${fmtDate(dados.periodo.ate + 'T12:00:00')}`, W - 12, 17, { align: 'right' })

  // ── Pontos selecionados ─────────────────────────────────────────────────────
  doc.setTextColor(...gray)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const pontoNomes = dados.pontos.map(p => p.nome).join(' · ')
  doc.text(`Pontos: ${pontoNomes || 'Todos'}`, 12, 28)
  doc.text(`Gerado em: ${fmtDateTime(dados.geradoEm)}`, W - 12, 28, { align: 'right' })

  // ── Cards de resumo ─────────────────────────────────────────────────────────
  const cards = [
    { label: 'Total de Ciclos',    value: String(dados.resumo.totalCiclos) },
    { label: 'Ciclos Concluídos',  value: String(dados.resumo.ciclosConcluidos) },
    { label: 'Taxa de Cumprimento',value: `${dados.resumo.taxaCumprimento}%` },
    { label: 'Total de Eventos',   value: String(dados.resumo.totalEventos) },
    { label: 'Check-ins',          value: String(dados.resumo.totalCheckins) },
    { label: 'Alertas',            value: String(dados.resumo.totalAlertas) },
  ]
  const cardW = (W - 24) / cards.length
  cards.forEach((c, i) => {
    const x = 12 + i * cardW
    doc.setFillColor(245, 247, 250)
    doc.roundedRect(x, 32, cardW - 3, 18, 2, 2, 'F')
    doc.setTextColor(...blue)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(c.value, x + (cardW - 3) / 2, 42, { align: 'center' })
    doc.setTextColor(...gray)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(c.label, x + (cardW - 3) / 2, 47, { align: 'center' })
  })

  // ── Tabela de Eventos ───────────────────────────────────────────────────────
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Eventos', 12, 60)

  autoTable(doc, {
    startY: 63,
    head: [['Tipo', 'Código', 'Ponto', 'Operador', 'Data/Hora', 'WhatsApp', 'Monitorado']],
    body: dados.eventos.map(e => [
      TIPO_PT[e.tipo] ?? e.tipo,
      e.codigoEvento ? `#${e.codigoEvento}` : '—',
      e.ponto,
      e.vigilante,
      fmtDateTime(e.ocorridoEm),
      e.encaminhado ? 'Enviado' : 'Pendente',
      e.monitorado  ? 'Sim'     : 'Não',
    ]),
    headStyles:    { fillColor: blue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles:    { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    columnStyles:  { 0: { cellWidth: 28 }, 1: { cellWidth: 18 }, 4: { cellWidth: 32 }, 5: { cellWidth: 20 }, 6: { cellWidth: 22 } },
    margin:        { left: 12, right: 12 },
  })

  // ── Tabela de Ciclos ────────────────────────────────────────────────────────
  const afterEvents = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  if (afterEvents < doc.internal.pageSize.getHeight() - 30) {
    doc.setTextColor(30, 30, 30)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Ciclos', 12, afterEvents)

    autoTable(doc, {
      startY: afterEvents + 3,
      head: [['Ponto', 'Status', 'Iniciado em', 'Finalizado em', 'Check-in em']],
      body: dados.ciclos.map(c => [
        c.ponto,
        STATUS_PT[c.status] ?? c.status,
        fmtDateTime(c.iniciadoEm),
        c.finalizadoEm ? fmtDateTime(c.finalizadoEm) : '—',
        c.checkinEm    ? fmtDateTime(c.checkinEm)    : '—',
      ]),
      headStyles:    { fillColor: blue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles:    { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      margin:        { left: 12, right: 12 },
    })
  }

  // ── Rodapé ──────────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const H = doc.internal.pageSize.getHeight()
    doc.setDrawColor(220, 220, 220)
    doc.line(12, H - 8, W - 12, H - 8)
    doc.setTextColor(180, 180, 180)
    doc.setFontSize(7)
    doc.text('OpenCheck — Sistema de Conformidade de Abertura', 12, H - 4)
    doc.text(`Página ${i} de ${pages}`, W - 12, H - 4, { align: 'right' })
  }

  doc.save(`relatorio-${dados.periodo.de}-${dados.periodo.ate}.pdf`)
}

async function gerarExcel(dados: RelatorioDados) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  // Sheet Resumo
  const resumoData = [
    ['OpenCheck — Relatório de Ciclos e Eventos'],
    [],
    ['Empresa',  dados.empresa.nome],
    ['Período',  `${fmtDate(dados.periodo.de + 'T12:00:00')} a ${fmtDate(dados.periodo.ate + 'T12:00:00')}`],
    ['Pontos',   dados.pontos.map(p => p.nome).join(', ') || 'Todos'],
    ['Gerado em', fmtDateTime(dados.geradoEm)],
    [],
    ['RESUMO'],
    ['Total de Ciclos',     dados.resumo.totalCiclos],
    ['Ciclos Concluídos',   dados.resumo.ciclosConcluidos],
    ['Ciclos com Alerta',   dados.resumo.ciclosAlerta],
    ['Taxa de Cumprimento', `${dados.resumo.taxaCumprimento}%`],
    ['Total de Eventos',    dados.resumo.totalEventos],
    ['Check-ins',           dados.resumo.totalCheckins],
    ['Alertas',             dados.resumo.totalAlertas],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoData), 'Resumo')

  // Sheet Eventos
  const eventosData = [
    ['Tipo', 'Código', 'Ponto', 'Operador', 'Data/Hora', 'WhatsApp', 'Monitorado'],
    ...dados.eventos.map(e => [
      TIPO_PT[e.tipo] ?? e.tipo,
      e.codigoEvento ? `#${e.codigoEvento}` : '—',
      e.ponto,
      e.vigilante,
      fmtDateTime(e.ocorridoEm),
      e.encaminhado ? 'Enviado' : 'Pendente',
      e.monitorado  ? 'Sim'     : 'Não',
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eventosData), 'Eventos')

  // Sheet Ciclos
  const ciclosData = [
    ['Ponto', 'Status', 'Iniciado em', 'Finalizado em', 'Check-in em'],
    ...dados.ciclos.map(c => [
      c.ponto,
      STATUS_PT[c.status] ?? c.status,
      fmtDateTime(c.iniciadoEm),
      c.finalizadoEm ? fmtDateTime(c.finalizadoEm) : '—',
      c.checkinEm    ? fmtDateTime(c.checkinEm)    : '—',
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ciclosData), 'Ciclos')

  XLSX.writeFile(wb, `relatorio-${dados.periodo.de}-${dados.periodo.ate}.xlsx`)
}

export default function RelatoriosPage() {
  const [pontos,   setPontos]   = useState<Ponto[]>([])
  const [pontoId,  setPontoId]  = useState('')
  const [de,       setDe]       = useState('')
  const [ate,      setAte]      = useState('')
  const [preview,  setPreview]  = useState<RelatorioDados | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [erro,     setErro]     = useState('')

  useEffect(() => {
    apiFetch<Ponto[]>('/pontos').then(setPontos).catch(() => {})
  }, [])

  async function carregar() {
    if (!de || !ate) { setErro('Selecione o período'); return }
    setLoading(true); setErro(''); setPreview(null)
    try {
      const q = new URLSearchParams({ de, ate })
      if (pontoId) q.set('pontoId', pontoId)
      const dados = await apiFetch<RelatorioDados>(`/relatorios/ciclos?${q}`)
      setPreview(dados)
    } catch (e) { setErro(String(e)) }
    finally { setLoading(false) }
  }

  async function exportar(tipo: 'pdf' | 'excel') {
    if (!preview) return
    setLoading(true)
    try {
      if (tipo === 'pdf')   await gerarPDF(preview)
      else                  await gerarExcel(preview)
    } catch (e) { setErro(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-gray-900">Relatórios</h1>
        <p className="text-gray-500 text-sm mt-1">Exporte dados de ciclos e eventos em PDF ou Excel</p>
      </div>

      {/* Filtros */}
      <div className="card space-y-5">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <FileText className="h-4 w-4 text-ggtech-blue" />
          <h2 className="font-heading font-semibold text-gray-800">Relatório de Ciclos e Eventos</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Data inicial *
            </label>
            <input type="date" className="input" value={de} onChange={e => setDe(e.target.value)} max={ate || undefined} />
          </div>
          <div>
            <label className="label flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Data final *
            </label>
            <input type="date" className="input" value={ate} onChange={e => setAte(e.target.value)} min={de || undefined} />
          </div>
          <div>
            <label className="label flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> Ponto (opcional)
            </label>
            <select className="input" value={pontoId} onChange={e => setPontoId(e.target.value)}>
              <option value="">Todos os pontos</option>
              {pontos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}

        <button
          onClick={carregar}
          disabled={loading}
          className="btn-primary flex items-center gap-2 px-6 py-2.5"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
          Carregar dados
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: Activity,     label: 'Ciclos',       value: preview.resumo.totalCiclos,     color: 'text-ggtech-blue' },
              { icon: CheckCircle,  label: 'Concluídos',   value: preview.resumo.ciclosConcluidos, color: 'text-green-600' },
              { icon: AlertTriangle,label: 'Taxa Cumpr.',  value: `${preview.resumo.taxaCumprimento}%`, color: preview.resumo.taxaCumprimento >= 80 ? 'text-green-600' : 'text-orange-500' },
              { icon: FileText,     label: 'Eventos',      value: preview.resumo.totalEventos,    color: 'text-gray-700' },
              { icon: CheckCircle,  label: 'Check-ins',    value: preview.resumo.totalCheckins,   color: 'text-green-600' },
              { icon: AlertTriangle,label: 'Alertas',      value: preview.resumo.totalAlertas,    color: 'text-red-600' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="card p-4 flex flex-col items-center text-center">
                <Icon className={`h-5 w-5 mb-1 ${color}`} />
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Info */}
          <div className="card p-4 flex items-center gap-3 text-sm text-gray-600">
            <Building2 className="h-4 w-4 text-ggtech-blue flex-shrink-0" />
            <span><strong>{preview.empresa.nome}</strong> · Período: {fmtDate(preview.periodo.de + 'T12:00:00')} a {fmtDate(preview.periodo.ate + 'T12:00:00')} · {preview.pontos.length} ponto(s) · {preview.eventos.length} eventos · {preview.ciclos.length} ciclos</span>
          </div>

          {/* Preview tabela eventos */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-ggtech-blue" />
              <h3 className="font-semibold text-sm text-gray-800">Prévia — Eventos ({preview.eventos.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                  <tr>
                    {['Tipo','Código','Ponto','Operador','Data/Hora','WhatsApp','Monitorado'].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.eventos.slice(0, 10).map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{TIPO_PT[e.tipo] ?? e.tipo}</td>
                      <td className="px-4 py-2 font-mono text-gray-400">{e.codigoEvento ? `#${e.codigoEvento}` : '—'}</td>
                      <td className="px-4 py-2">{e.ponto}</td>
                      <td className="px-4 py-2">{e.vigilante}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtDateTime(e.ocorridoEm)}</td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded-full text-xs ${e.encaminhado ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                          {e.encaminhado ? 'Enviado' : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-4 py-2">{e.monitorado ? 'Sim' : 'Não'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.eventos.length > 10 && (
                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
                  + {preview.eventos.length - 10} eventos adicionais incluídos no relatório completo
                </p>
              )}
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => exportar('pdf')}
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-sm"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar PDF
            </button>
            <button
              onClick={() => exportar('excel')}
              disabled={loading}
              className="btn-outline flex-1 flex items-center justify-center gap-2 py-3 text-sm"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
