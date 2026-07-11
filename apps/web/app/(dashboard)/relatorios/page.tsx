'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import {
  FileText, Download, Loader2, Calendar, FileSpreadsheet,
  Building2, MapPin, CheckCircle, Activity, Store, Clock, ShieldCheck,
} from 'lucide-react'

interface Ponto { id: string; nome: string; endereco?: string }
interface SupervisorItem { id: string; nome: string }
interface Empresa { id: string; nome: string; logoUrl?: string | null }

// Desenha a logo do cliente no canto direito do cabeçalho azul do PDF.
// Retorna a posição X onde os textos alinhados à direita devem terminar.
async function desenharLogoPDF(doc: import('jspdf').jsPDF, W: number, logoUrl?: string | null): Promise<number> {
  if (!logoUrl) return W - 12
  try {
    const img = new Image()
    img.src = logoUrl
    await img.decode()
    const h = 14
    const w = Math.min(42, (img.naturalWidth / img.naturalHeight) * h)
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(W - 14 - w, 3, w + 4, h + 4, 1.5, 1.5, 'F')
    doc.addImage(logoUrl, W - 12 - w, 5, w, h)
    return W - 18 - w
  } catch {
    return W - 12
  }
}

// ── Abertura/Fechamento ────────────────────────────────────────────────────
interface LinhaAbertura {
  pontoId: string; ponto: string; data: string
  statusAbertura: string; horaAberturaConfig: string | null; horaAberturaReal: string | null
  statusFechamento: string; horaFechamentoConfig: string | null; horaFechamentoReal: string | null
  operador: string
}
interface RelatorioAbertura {
  geradoEm: string
  empresa: Empresa
  periodo: { de: string; ate: string }
  pontos: Ponto[]
  resumo: { totalLinhas: number; abertas: number; abertasFora: number; naoAbriram: number; fechadas: number; naoFecharam: number }
  linhas: LinhaAbertura[]
}

// ── Ciclos/Eventos ─────────────────────────────────────────────────────────
interface RelatorioCiclos {
  geradoEm: string
  empresa: Empresa
  periodo: { de: string; ate: string }
  pontos: Ponto[]
  resumo: { totalCiclos: number; ciclosConcluidos: number; ciclosAlerta: number; totalEventos: number; totalCheckins: number; totalAlertas: number; taxaCumprimento: number }
  eventos: { id: string; tipo: string; codigoEvento: string | null; ponto: string; vigilante: string; ocorridoEm: string; encaminhado: boolean; monitorado: boolean }[]
  ciclos: { id: string; ponto: string; status: string; iniciadoEm: string; finalizadoEm: string | null; checkinEm: string | null }[]
}

// ── Rondas de Supervisão ───────────────────────────────────────────────────
interface VisitaRonda {
  supervisorId: string; supervisorNome: string
  pontoId: string; pontoNome: string
  entradaEm: string | null; saidaEm: string | null
  duracaoMinutos: number | null; emAberto: boolean
}
interface RelatorioRondas {
  geradoEm: string
  empresa: Empresa
  periodo: { de: string; ate: string }
  supervisores: SupervisorItem[]
  resumo: {
    totalVisitas: number; concluidas: number; emAberto: number; saidasSemEntrada: number
    tempoTotalMinutos: number; tempoMedioMinutos: number
    pontosVisitados: number; supervisoresAtivos: number
  }
  visitas: VisitaRonda[]
}

function fmtDuracao(min: number | null) {
  if (min === null) return '—'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h ${min % 60}min`
}

function statusVisita(v: VisitaRonda): string {
  if (v.emAberto) return 'Em aberto'
  if (!v.entradaEm) return 'Saída sem entrada'
  return 'Concluída'
}

const STATUS_ABERTURA_COLOR: Record<string, string> = {
  'Aberta':                'bg-green-100 text-green-700',
  'Aberta Fora do Horário':'bg-yellow-100 text-yellow-700',
  'Não Abriu':             'bg-red-100 text-red-700',
  'Aguardando Abertura':   'bg-blue-100 text-blue-700',
}
const STATUS_FECHAMENTO_COLOR: Record<string, string> = {
  'Fechada':               'bg-gray-100 text-gray-700',
  'Não Fechou':            'bg-red-100 text-red-700',
  'Aguardando Fechamento': 'bg-orange-100 text-orange-700',
  '—':                     'bg-gray-50 text-gray-400',
}
const TIPO_PT: Record<string, string> = {
  CHECKIN: 'Check-in', FALHA: 'Falha', PANICO: 'Pânico',
  PANICO_SILENCIOSO: 'Pânico silencioso', COACAO: 'Coação',
  ABERTURA_CHECKIN: 'Abertura check-in', ABERTURA_AUSENTE: 'Não abriu',
  FECHAMENTO_CHECKIN: 'Fechamento check-in', FECHAMENTO_AUSENTE: 'Não fechou',
}

function fmtDate(iso: string) {
  return new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR')
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ── PDF Abertura ───────────────────────────────────────────────────────────
async function gerarPDFAbertura(dados: RelatorioAbertura) {
  const { default: jsPDF }    = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W    = doc.internal.pageSize.getWidth()
  const blue = [0, 82, 204] as [number, number, number]
  const gray = [100, 100, 100] as [number, number, number]

  doc.setFillColor(...blue)
  doc.rect(0, 0, W, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('OpenCheck', 12, 10)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text('Relatório de Abertura / Fechamento', 12, 17)
  const rightX = await desenharLogoPDF(doc, W, dados.empresa.logoUrl)
  doc.setTextColor(255, 255, 255); doc.setFontSize(10)
  doc.text(`${dados.empresa.nome}`, rightX, 10, { align: 'right' })
  doc.text(`Período: ${fmtDate(dados.periodo.de)} a ${fmtDate(dados.periodo.ate)}`, rightX, 17, { align: 'right' })

  doc.setTextColor(...gray); doc.setFontSize(8)
  doc.text(`Pontos: ${dados.pontos.map(p => p.nome).join(' · ') || 'Todos'}`, 12, 28)
  doc.text(`Gerado em: ${fmtDateTime(dados.geradoEm)}`, W - 12, 28, { align: 'right' })

  const cards = [
    { label: 'Total de dias',           value: String(dados.resumo.totalLinhas) },
    { label: 'Abertas no prazo',         value: String(dados.resumo.abertas) },
    { label: 'Abertas fora do horário',  value: String(dados.resumo.abertasFora) },
    { label: 'Não abriram',              value: String(dados.resumo.naoAbriram) },
    { label: 'Fechadas',                 value: String(dados.resumo.fechadas) },
    { label: 'Não fecharam',             value: String(dados.resumo.naoFecharam) },
  ]
  const cardW = (W - 24) / cards.length
  cards.forEach((c, i) => {
    const x = 12 + i * cardW
    doc.setFillColor(245, 247, 250)
    doc.roundedRect(x, 32, cardW - 3, 18, 2, 2, 'F')
    doc.setTextColor(...blue); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(c.value, x + (cardW - 3) / 2, 42, { align: 'center' })
    doc.setTextColor(...gray); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
    doc.text(c.label, x + (cardW - 3) / 2, 47, { align: 'center' })
  })

  doc.setTextColor(30, 30, 30); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Status por Loja / Dia', 12, 60)

  autoTable(doc, {
    startY: 63,
    head: [['Data', 'Ponto', 'Status Abertura', 'Abertura Config.', 'Abertura Real', 'Status Fechamento', 'Fechamento Config.', 'Fechamento Real', 'Operador']],
    body: dados.linhas.map(l => [
      fmtDate(l.data),
      l.ponto,
      l.statusAbertura,
      l.horaAberturaConfig ?? '—',
      fmtHora(l.horaAberturaReal),
      l.statusFechamento,
      l.horaFechamentoConfig ?? '—',
      fmtHora(l.horaFechamentoReal),
      l.operador,
    ]),
    headStyles:    { fillColor: blue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 7 },
    bodyStyles:    { fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const val = String(data.cell.raw)
        if (val === 'Aberta') doc.setTextColor(22, 163, 74)
        else if (val === 'Aberta Fora do Horário') doc.setTextColor(202, 138, 4)
        else if (val === 'Não Abriu') doc.setTextColor(220, 38, 38)
        else doc.setTextColor(59, 130, 246)
      }
      if (data.section === 'body' && data.column.index === 5) {
        const val = String(data.cell.raw)
        if (val === 'Fechada') doc.setTextColor(75, 85, 99)
        else if (val === 'Não Fechou') doc.setTextColor(220, 38, 38)
        else if (val === 'Aguardando Fechamento') doc.setTextColor(234, 88, 12)
      }
    },
    margin: { left: 12, right: 12 },
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const H = doc.internal.pageSize.getHeight()
    doc.setDrawColor(220, 220, 220)
    doc.line(12, H - 8, W - 12, H - 8)
    doc.setTextColor(180, 180, 180); doc.setFontSize(7)
    doc.text('OpenCheck — Relatório de Abertura / Fechamento', 12, H - 4)
    doc.text(`Página ${i} de ${pages}`, W - 12, H - 4, { align: 'right' })
  }

  doc.save(`abertura-fechamento-${dados.periodo.de}-${dados.periodo.ate}.pdf`)
}

// ── Excel Abertura ─────────────────────────────────────────────────────────
async function gerarExcelAbertura(dados: RelatorioAbertura) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  const resumo = [
    ['OpenCheck — Relatório de Abertura / Fechamento'],
    [],
    ['Empresa',  dados.empresa.nome],
    ['Período',  `${fmtDate(dados.periodo.de)} a ${fmtDate(dados.periodo.ate)}`],
    ['Pontos',   dados.pontos.map(p => p.nome).join(', ') || 'Todos'],
    ['Gerado em', fmtDateTime(dados.geradoEm)],
    [],
    ['RESUMO'],
    ['Total de dias/pontos',    dados.resumo.totalLinhas],
    ['Abertas no prazo',         dados.resumo.abertas],
    ['Abertas fora do horário',  dados.resumo.abertasFora],
    ['Não abriram',              dados.resumo.naoAbriram],
    ['Fechadas',                 dados.resumo.fechadas],
    ['Não fecharam',             dados.resumo.naoFecharam],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo')

  const linhasData = [
    ['Data', 'Ponto', 'Status Abertura', 'Abertura Config.', 'Abertura Real', 'Status Fechamento', 'Fechamento Config.', 'Fechamento Real', 'Operador'],
    ...dados.linhas.map(l => [
      fmtDate(l.data),
      l.ponto,
      l.statusAbertura,
      l.horaAberturaConfig ?? '—',
      fmtHora(l.horaAberturaReal),
      l.statusFechamento,
      l.horaFechamentoConfig ?? '—',
      fmtHora(l.horaFechamentoReal),
      l.operador,
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasData), 'Abertura-Fechamento')

  XLSX.writeFile(wb, `abertura-fechamento-${dados.periodo.de}-${dados.periodo.ate}.xlsx`)
}

// ── PDF Ciclos ─────────────────────────────────────────────────────────────
async function gerarPDFCiclos(dados: RelatorioCiclos) {
  const { default: jsPDF }    = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W    = doc.internal.pageSize.getWidth()
  const blue = [0, 82, 204] as [number, number, number]
  const gray = [100, 100, 100] as [number, number, number]

  doc.setFillColor(...blue)
  doc.rect(0, 0, W, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('OpenCheck', 12, 10)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text('Relatório de Ciclos e Eventos', 12, 17)
  const rightX = await desenharLogoPDF(doc, W, dados.empresa.logoUrl)
  doc.setTextColor(255, 255, 255); doc.setFontSize(10)
  doc.text(`${dados.empresa.nome}`, rightX, 10, { align: 'right' })
  doc.text(`Período: ${fmtDate(dados.periodo.de)} a ${fmtDate(dados.periodo.ate)}`, rightX, 17, { align: 'right' })

  doc.setTextColor(...gray); doc.setFontSize(8)
  doc.text(`Pontos: ${dados.pontos.map(p => p.nome).join(' · ') || 'Todos'}`, 12, 28)
  doc.text(`Gerado em: ${fmtDateTime(dados.geradoEm)}`, W - 12, 28, { align: 'right' })

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
    doc.setTextColor(...blue); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(c.value, x + (cardW - 3) / 2, 42, { align: 'center' })
    doc.setTextColor(...gray); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
    doc.text(c.label, x + (cardW - 3) / 2, 47, { align: 'center' })
  })

  doc.setTextColor(30, 30, 30); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Eventos', 12, 60)

  autoTable(doc, {
    startY: 63,
    head: [['Tipo', 'Código', 'Ponto', 'Operador', 'Data/Hora', 'WhatsApp', 'Monitorado']],
    body: dados.eventos.map(e => [
      TIPO_PT[e.tipo] ?? e.tipo,
      e.codigoEvento ? `#${e.codigoEvento}` : '—',
      e.ponto, e.vigilante, fmtDateTime(e.ocorridoEm),
      e.encaminhado ? 'Enviado' : 'Pendente',
      e.monitorado  ? 'Sim'     : 'Não',
    ]),
    headStyles: { fillColor: blue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    margin: { left: 12, right: 12 },
  })

  const afterEvents = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  if (afterEvents < doc.internal.pageSize.getHeight() - 30) {
    doc.setTextColor(30, 30, 30); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
    doc.text('Ciclos', 12, afterEvents)
    autoTable(doc, {
      startY: afterEvents + 3,
      head: [['Ponto', 'Status', 'Iniciado em', 'Finalizado em', 'Check-in em']],
      body: dados.ciclos.map(c => [
        c.ponto,
        { CONCLUIDO: 'Concluído', ALERTA: 'Alerta', CANCELADO: 'Cancelado', EM_ANDAMENTO: 'Em andamento' }[c.status] ?? c.status,
        fmtDateTime(c.iniciadoEm),
        c.finalizadoEm ? fmtDateTime(c.finalizadoEm) : '—',
        c.checkinEm    ? fmtDateTime(c.checkinEm)    : '—',
      ]),
      headStyles: { fillColor: blue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      margin: { left: 12, right: 12 },
    })
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const H = doc.internal.pageSize.getHeight()
    doc.setDrawColor(220, 220, 220)
    doc.line(12, H - 8, W - 12, H - 8)
    doc.setTextColor(180, 180, 180); doc.setFontSize(7)
    doc.text('OpenCheck — Relatório de Ciclos e Eventos', 12, H - 4)
    doc.text(`Página ${i} de ${pages}`, W - 12, H - 4, { align: 'right' })
  }

  doc.save(`ciclos-${dados.periodo.de}-${dados.periodo.ate}.pdf`)
}

async function gerarExcelCiclos(dados: RelatorioCiclos) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['OpenCheck — Relatório de Ciclos e Eventos'], [],
    ['Empresa', dados.empresa.nome],
    ['Período', `${fmtDate(dados.periodo.de)} a ${fmtDate(dados.periodo.ate)}`],
    ['Pontos',  dados.pontos.map(p => p.nome).join(', ') || 'Todos'],
    ['Gerado em', fmtDateTime(dados.geradoEm)], [],
    ['RESUMO'],
    ['Total de Ciclos',     dados.resumo.totalCiclos],
    ['Ciclos Concluídos',   dados.resumo.ciclosConcluidos],
    ['Ciclos com Alerta',   dados.resumo.ciclosAlerta],
    ['Taxa de Cumprimento', `${dados.resumo.taxaCumprimento}%`],
    ['Total de Eventos',    dados.resumo.totalEventos],
    ['Check-ins',           dados.resumo.totalCheckins],
    ['Alertas',             dados.resumo.totalAlertas],
  ]), 'Resumo')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Tipo', 'Código', 'Ponto', 'Operador', 'Data/Hora', 'WhatsApp', 'Monitorado'],
    ...dados.eventos.map(e => [
      TIPO_PT[e.tipo] ?? e.tipo,
      e.codigoEvento ? `#${e.codigoEvento}` : '—',
      e.ponto, e.vigilante, fmtDateTime(e.ocorridoEm),
      e.encaminhado ? 'Enviado' : 'Pendente',
      e.monitorado  ? 'Sim' : 'Não',
    ]),
  ]), 'Eventos')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Ponto', 'Status', 'Iniciado em', 'Finalizado em', 'Check-in em'],
    ...dados.ciclos.map(c => [
      c.ponto,
      { CONCLUIDO: 'Concluído', ALERTA: 'Alerta', CANCELADO: 'Cancelado', EM_ANDAMENTO: 'Em andamento' }[c.status] ?? c.status,
      fmtDateTime(c.iniciadoEm),
      c.finalizadoEm ? fmtDateTime(c.finalizadoEm) : '—',
      c.checkinEm    ? fmtDateTime(c.checkinEm)    : '—',
    ]),
  ]), 'Ciclos')

  XLSX.writeFile(wb, `ciclos-${dados.periodo.de}-${dados.periodo.ate}.xlsx`)
}

// ── PDF Rondas ─────────────────────────────────────────────────────────────
async function gerarPDFRondas(dados: RelatorioRondas) {
  const { default: jsPDF }    = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W    = doc.internal.pageSize.getWidth()
  const blue = [0, 82, 204] as [number, number, number]
  const gray = [100, 100, 100] as [number, number, number]

  doc.setFillColor(...blue)
  doc.rect(0, 0, W, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('OpenCheck', 12, 10)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.text('Relatório de Rondas de Supervisão', 12, 17)
  const rightX = await desenharLogoPDF(doc, W, dados.empresa.logoUrl)
  doc.setTextColor(255, 255, 255); doc.setFontSize(10)
  doc.text(`${dados.empresa.nome}`, rightX, 10, { align: 'right' })
  doc.text(`Período: ${fmtDate(dados.periodo.de)} a ${fmtDate(dados.periodo.ate)}`, rightX, 17, { align: 'right' })

  doc.setTextColor(...gray); doc.setFontSize(8)
  doc.text(`Supervisores: ${dados.supervisores.map(s => s.nome).join(' · ') || 'Todos'}`, 12, 28)
  doc.text(`Gerado em: ${fmtDateTime(dados.geradoEm)}`, W - 12, 28, { align: 'right' })

  const cards = [
    { label: 'Total de visitas',   value: String(dados.resumo.totalVisitas) },
    { label: 'Concluídas',         value: String(dados.resumo.concluidas) },
    { label: 'Em aberto',          value: String(dados.resumo.emAberto) },
    { label: 'Tempo total',        value: fmtDuracao(dados.resumo.tempoTotalMinutos) },
    { label: 'Permanência média',  value: fmtDuracao(dados.resumo.tempoMedioMinutos) },
    { label: 'Pontos visitados',   value: String(dados.resumo.pontosVisitados) },
  ]
  const cardW = (W - 24) / cards.length
  cards.forEach((c, i) => {
    const x = 12 + i * cardW
    doc.setFillColor(245, 247, 250)
    doc.roundedRect(x, 32, cardW - 3, 18, 2, 2, 'F')
    doc.setTextColor(...blue); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text(c.value, x + (cardW - 3) / 2, 42, { align: 'center' })
    doc.setTextColor(...gray); doc.setFontSize(7); doc.setFont('helvetica', 'normal')
    doc.text(c.label, x + (cardW - 3) / 2, 47, { align: 'center' })
  })

  doc.setTextColor(30, 30, 30); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Visitas de Supervisão', 12, 60)

  autoTable(doc, {
    startY: 63,
    head: [['Supervisor', 'Ponto', 'Entrada', 'Saída', 'Permanência', 'Status']],
    body: dados.visitas.map(v => [
      v.supervisorNome,
      v.pontoNome,
      v.entradaEm ? fmtDateTime(v.entradaEm) : '—',
      v.saidaEm   ? fmtDateTime(v.saidaEm)   : '—',
      fmtDuracao(v.duracaoMinutos),
      statusVisita(v),
    ]),
    headStyles: { fillColor: blue, textColor: [255,255,255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const val = String(data.cell.raw)
        if (val === 'Concluída') doc.setTextColor(22, 163, 74)
        else if (val === 'Em aberto') doc.setTextColor(202, 138, 4)
        else doc.setTextColor(220, 38, 38)
      }
    },
    margin: { left: 12, right: 12 },
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    const H = doc.internal.pageSize.getHeight()
    doc.setDrawColor(220, 220, 220)
    doc.line(12, H - 8, W - 12, H - 8)
    doc.setTextColor(180, 180, 180); doc.setFontSize(7)
    doc.text('OpenCheck — Relatório de Rondas de Supervisão', 12, H - 4)
    doc.text(`Página ${i} de ${pages}`, W - 12, H - 4, { align: 'right' })
  }

  doc.save(`rondas-supervisao-${dados.periodo.de}-${dados.periodo.ate}.pdf`)
}

// ── Excel Rondas ───────────────────────────────────────────────────────────
async function gerarExcelRondas(dados: RelatorioRondas) {
  const XLSX = await import('xlsx')
  const wb   = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['OpenCheck — Relatório de Rondas de Supervisão'], [],
    ['Empresa',      dados.empresa.nome],
    ['Período',      `${fmtDate(dados.periodo.de)} a ${fmtDate(dados.periodo.ate)}`],
    ['Supervisores', dados.supervisores.map(s => s.nome).join(', ') || 'Todos'],
    ['Gerado em',    fmtDateTime(dados.geradoEm)], [],
    ['RESUMO'],
    ['Total de visitas',    dados.resumo.totalVisitas],
    ['Concluídas',          dados.resumo.concluidas],
    ['Em aberto',           dados.resumo.emAberto],
    ['Saídas sem entrada',  dados.resumo.saidasSemEntrada],
    ['Tempo total',         fmtDuracao(dados.resumo.tempoTotalMinutos)],
    ['Permanência média',   fmtDuracao(dados.resumo.tempoMedioMinutos)],
    ['Pontos visitados',    dados.resumo.pontosVisitados],
    ['Supervisores ativos', dados.resumo.supervisoresAtivos],
  ]), 'Resumo')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Supervisor', 'Ponto', 'Entrada', 'Saída', 'Permanência', 'Status'],
    ...dados.visitas.map(v => [
      v.supervisorNome,
      v.pontoNome,
      v.entradaEm ? fmtDateTime(v.entradaEm) : '—',
      v.saidaEm   ? fmtDateTime(v.saidaEm)   : '—',
      fmtDuracao(v.duracaoMinutos),
      statusVisita(v),
    ]),
  ]), 'Rondas')

  XLSX.writeFile(wb, `rondas-supervisao-${dados.periodo.de}-${dados.periodo.ate}.xlsx`)
}

// ── Página ─────────────────────────────────────────────────────────────────
export default function RelatoriosPage() {
  const [aba,      setAba]      = useState<'abertura' | 'ciclos' | 'rondas'>('abertura')
  const [pontos,   setPontos]   = useState<Ponto[]>([])
  const [supervisores, setSupervisores] = useState<SupervisorItem[]>([])
  const [pontoId,  setPontoId]  = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [de,       setDe]       = useState('')
  const [ate,      setAte]      = useState('')
  const [previewAb, setPreviewAb] = useState<RelatorioAbertura | null>(null)
  const [previewCi, setPreviewCi] = useState<RelatorioCiclos | null>(null)
  const [previewRo, setPreviewRo] = useState<RelatorioRondas | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [erro,     setErro]     = useState('')

  useEffect(() => {
    apiFetch<Ponto[]>('/pontos').then(setPontos).catch(() => {})
    apiFetch<SupervisorItem[]>('/supervisores').then(setSupervisores).catch(() => {})
  }, [])

  function limparPreviews() {
    setPreviewAb(null); setPreviewCi(null); setPreviewRo(null)
  }

  async function carregar() {
    if (!de || !ate) { setErro('Selecione o período'); return }
    setLoading(true); setErro(''); limparPreviews()
    try {
      const q = new URLSearchParams({ de, ate })
      if (pontoId) q.set('pontoId', pontoId)
      if (aba === 'abertura') {
        const dados = await apiFetch<RelatorioAbertura>(`/relatorios/abertura?${q}`)
        setPreviewAb(dados)
      } else if (aba === 'ciclos') {
        const dados = await apiFetch<RelatorioCiclos>(`/relatorios/ciclos?${q}`)
        setPreviewCi(dados)
      } else {
        if (supervisorId) q.set('supervisorId', supervisorId)
        const dados = await apiFetch<RelatorioRondas>(`/relatorios/rondas?${q}`)
        setPreviewRo(dados)
      }
    } catch (e) { setErro(String(e)) }
    finally { setLoading(false) }
  }

  async function exportar(tipo: 'pdf' | 'excel') {
    setLoading(true)
    try {
      if (aba === 'abertura' && previewAb) {
        if (tipo === 'pdf') await gerarPDFAbertura(previewAb)
        else await gerarExcelAbertura(previewAb)
      } else if (aba === 'ciclos' && previewCi) {
        if (tipo === 'pdf') await gerarPDFCiclos(previewCi)
        else await gerarExcelCiclos(previewCi)
      } else if (aba === 'rondas' && previewRo) {
        if (tipo === 'pdf') await gerarPDFRondas(previewRo)
        else await gerarExcelRondas(previewRo)
      }
    } catch (e) { setErro(String(e)) }
    finally { setLoading(false) }
  }

  const hasPreview = aba === 'abertura' ? !!previewAb : aba === 'ciclos' ? !!previewCi : !!previewRo

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-gray-900">Relatórios</h1>
        <p className="text-gray-500 text-sm mt-1">Exporte dados operacionais em PDF ou Excel</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => { setAba('abertura'); limparPreviews() }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'abertura' ? 'bg-white text-ggtech-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Store className="h-4 w-4" /> Abertura / Fechamento
        </button>
        <button
          onClick={() => { setAba('ciclos'); limparPreviews() }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'ciclos' ? 'bg-white text-ggtech-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Activity className="h-4 w-4" /> Ciclos e Eventos
        </button>
        <button
          onClick={() => { setAba('rondas'); limparPreviews() }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'rondas' ? 'bg-white text-ggtech-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <ShieldCheck className="h-4 w-4" /> Rondas de Supervisão
        </button>
      </div>

      {/* Filtros */}
      <div className="card space-y-5">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <FileText className="h-4 w-4 text-ggtech-blue" />
          <h2 className="font-heading font-semibold text-gray-800">
            {aba === 'abertura' ? 'Relatório de Abertura / Fechamento' : aba === 'ciclos' ? 'Relatório de Ciclos e Eventos' : 'Relatório de Rondas de Supervisão'}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Data inicial *</label>
            <input type="date" className="input" value={de} onChange={e => setDe(e.target.value)} max={ate || undefined} />
          </div>
          <div>
            <label className="label flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Data final *</label>
            <input type="date" className="input" value={ate} onChange={e => setAte(e.target.value)} min={de || undefined} />
          </div>
          <div>
            <label className="label flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Ponto (opcional)</label>
            <select className="input" value={pontoId} onChange={e => setPontoId(e.target.value)}>
              <option value="">Todos os pontos</option>
              {pontos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          {aba === 'rondas' && (
            <div>
              <label className="label flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Supervisor (opcional)</label>
              <select className="input" value={supervisorId} onChange={e => setSupervisorId(e.target.value)}>
                <option value="">Todos os supervisores</option>
                {supervisores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          )}
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{erro}</div>}

        <button onClick={carregar} disabled={loading} className="btn-primary flex items-center gap-2 px-6 py-2.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
          Carregar dados
        </button>
      </div>

      {/* Preview Abertura */}
      {aba === 'abertura' && previewAb && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total dias',          value: previewAb.resumo.totalLinhas,  color: 'text-gray-700' },
              { label: 'Abertas',             value: previewAb.resumo.abertas,       color: 'text-green-600' },
              { label: 'Fora do horário',     value: previewAb.resumo.abertasFora,  color: 'text-yellow-600' },
              { label: 'Não abriram',         value: previewAb.resumo.naoAbriram,   color: 'text-red-600' },
              { label: 'Fechadas',            value: previewAb.resumo.fechadas,      color: 'text-gray-600' },
              { label: 'Não fecharam',        value: previewAb.resumo.naoFecharam,  color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-4 flex flex-col items-center text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="card p-4 flex items-center gap-3 text-sm text-gray-600">
            <Building2 className="h-4 w-4 text-ggtech-blue flex-shrink-0" />
            <span><strong>{previewAb.empresa.nome}</strong> · {fmtDate(previewAb.periodo.de)} a {fmtDate(previewAb.periodo.ate)} · {previewAb.linhas.length} registros</span>
          </div>

          {/* Tabela */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Clock className="h-4 w-4 text-ggtech-blue" />
              <h3 className="font-semibold text-sm text-gray-800">Status por Loja / Dia ({previewAb.linhas.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                  <tr>
                    {['Data','Ponto','Status Abertura','Hr. Config','Hr. Real','Status Fechamento','Hr. Config','Hr. Real','Operador'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {previewAb.linhas.slice(0, 15).map((l, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.data)}</td>
                      <td className="px-3 py-2 font-medium">{l.ponto}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_ABERTURA_COLOR[l.statusAbertura] ?? 'bg-gray-100 text-gray-500'}`}>
                          {l.statusAbertura}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{l.horaAberturaConfig ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{fmtHora(l.horaAberturaReal)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_FECHAMENTO_COLOR[l.statusFechamento] ?? 'bg-gray-100 text-gray-500'}`}>
                          {l.statusFechamento}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{l.horaFechamentoConfig ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{fmtHora(l.horaFechamentoReal)}</td>
                      <td className="px-3 py-2 text-gray-500">{l.operador}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewAb.linhas.length > 15 && (
                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
                  + {previewAb.linhas.length - 15} registros adicionais incluídos no relatório completo
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => exportar('pdf')} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar PDF
            </button>
            <button onClick={() => exportar('excel')} disabled={loading} className="btn-outline flex-1 flex items-center justify-center gap-2 py-3 text-sm">
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </button>
          </div>
        </div>
      )}

      {/* Preview Ciclos */}
      {aba === 'ciclos' && previewCi && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Ciclos',       value: previewCi.resumo.totalCiclos,      color: 'text-ggtech-blue' },
              { label: 'Concluídos',   value: previewCi.resumo.ciclosConcluidos,  color: 'text-green-600' },
              { label: 'Taxa Cumpr.',  value: `${previewCi.resumo.taxaCumprimento}%`, color: previewCi.resumo.taxaCumprimento >= 80 ? 'text-green-600' : 'text-orange-500' },
              { label: 'Eventos',      value: previewCi.resumo.totalEventos,     color: 'text-gray-700' },
              { label: 'Check-ins',    value: previewCi.resumo.totalCheckins,    color: 'text-green-600' },
              { label: 'Alertas',      value: previewCi.resumo.totalAlertas,     color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-4 flex flex-col items-center text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="card p-4 flex items-center gap-3 text-sm text-gray-600">
            <Building2 className="h-4 w-4 text-ggtech-blue flex-shrink-0" />
            <span><strong>{previewCi.empresa.nome}</strong> · {fmtDate(previewCi.periodo.de)} a {fmtDate(previewCi.periodo.ate)} · {previewCi.eventos.length} eventos · {previewCi.ciclos.length} ciclos</span>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-ggtech-blue" />
              <h3 className="font-semibold text-sm text-gray-800">Prévia — Eventos ({previewCi.eventos.length})</h3>
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
                  {previewCi.eventos.slice(0, 10).map(e => (
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
              {previewCi.eventos.length > 10 && (
                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
                  + {previewCi.eventos.length - 10} eventos adicionais incluídos no relatório completo
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => exportar('pdf')} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar PDF
            </button>
            <button onClick={() => exportar('excel')} disabled={loading} className="btn-outline flex-1 flex items-center justify-center gap-2 py-3 text-sm">
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </button>
          </div>
        </div>
      )}

      {/* Preview Rondas */}
      {aba === 'rondas' && previewRo && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Visitas',            value: previewRo.resumo.totalVisitas,               color: 'text-ggtech-blue' },
              { label: 'Concluídas',         value: previewRo.resumo.concluidas,                  color: 'text-green-600' },
              { label: 'Em aberto',          value: previewRo.resumo.emAberto,                    color: previewRo.resumo.emAberto > 0 ? 'text-yellow-600' : 'text-gray-600' },
              { label: 'Tempo total',        value: fmtDuracao(previewRo.resumo.tempoTotalMinutos), color: 'text-gray-700' },
              { label: 'Permanência média',  value: fmtDuracao(previewRo.resumo.tempoMedioMinutos), color: 'text-gray-700' },
              { label: 'Pontos visitados',   value: previewRo.resumo.pontosVisitados,             color: 'text-ggtech-blue' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-4 flex flex-col items-center text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="card p-4 flex items-center gap-3 text-sm text-gray-600">
            <Building2 className="h-4 w-4 text-ggtech-blue flex-shrink-0" />
            <span>
              <strong>{previewRo.empresa.nome}</strong> · {fmtDate(previewRo.periodo.de)} a {fmtDate(previewRo.periodo.ate)} ·{' '}
              {previewRo.resumo.supervisoresAtivos} supervisor(es) ativo(s) · {previewRo.visitas.length} visitas
            </span>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-ggtech-blue" />
              <h3 className="font-semibold text-sm text-gray-800">Prévia — Visitas ({previewRo.visitas.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                  <tr>
                    {['Supervisor','Ponto','Entrada','Saída','Permanência','Status'].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {previewRo.visitas.slice(0, 15).map((v, i) => {
                    const st = statusVisita(v)
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{v.supervisorNome}</td>
                        <td className="px-4 py-2">{v.pontoNome}</td>
                        <td className="px-4 py-2 text-gray-500">{v.entradaEm ? fmtDateTime(v.entradaEm) : '—'}</td>
                        <td className="px-4 py-2 text-gray-500">{v.saidaEm ? fmtDateTime(v.saidaEm) : '—'}</td>
                        <td className="px-4 py-2 text-gray-500">{fmtDuracao(v.duracaoMinutos)}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            st === 'Concluída' ? 'bg-green-100 text-green-700'
                            : st === 'Em aberto' ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                            {st}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {previewRo.visitas.length > 15 && (
                <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-50">
                  + {previewRo.visitas.length - 15} visitas adicionais incluídas no relatório completo
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => exportar('pdf')} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar PDF
            </button>
            <button onClick={() => exportar('excel')} disabled={loading} className="btn-outline flex-1 flex items-center justify-center gap-2 py-3 text-sm">
              <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
            </button>
          </div>
        </div>
      )}

      {!hasPreview && !loading && de && ate && (
        <div className="card p-8 text-center text-gray-400 text-sm">
          Clique em "Carregar dados" para visualizar o relatório
        </div>
      )}
    </div>
  )
}
