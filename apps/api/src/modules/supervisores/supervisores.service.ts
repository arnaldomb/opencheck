import { prisma } from '@opencheck/database'

export interface VisitaSupervisor {
  supervisorId: string
  supervisorNome: string
  pontoId: string
  pontoNome: string
  entradaEm: Date | null
  saidaEm: Date | null
  duracaoMinutos: number | null
  emAberto: boolean
}

export interface RondasOpts {
  supervisorId?: string
  pontoId?: string
  dataInicio: Date
  dataFim: Date
}

// Pareia registros ENTRADA→SAIDA por supervisor+ponto, em ordem cronológica.
// Entrada sem saída vira visita "em aberto"; saída sem entrada no período é
// mantida para auditoria.
export async function getRondas(tenantId: string, opts: RondasOpts): Promise<VisitaSupervisor[]> {
  const registros = await prisma.registroSupervisor.findMany({
    where: {
      tenantId,
      ...(opts.supervisorId ? { supervisorId: opts.supervisorId } : {}),
      ...(opts.pontoId ? { pontoId: opts.pontoId } : {}),
      registradoEm: { gte: opts.dataInicio, lte: opts.dataFim },
    },
    include: {
      supervisor: { select: { nome: true } },
      ponto:      { select: { nome: true } },
    },
    orderBy: { registradoEm: 'asc' },
    take: 2000,
  })

  const visitas: VisitaSupervisor[] = []
  const abertas = new Map<string, number>() // chave supervisor+ponto → índice em visitas

  for (const r of registros) {
    const chave = `${r.supervisorId}:${r.pontoId}`
    if (r.tipo === 'ENTRADA') {
      abertas.set(chave, visitas.push({
        supervisorId: r.supervisorId, supervisorNome: r.supervisor.nome,
        pontoId: r.pontoId, pontoNome: r.ponto.nome,
        entradaEm: r.registradoEm, saidaEm: null,
        duracaoMinutos: null, emAberto: true,
      }) - 1)
    } else {
      const idx = abertas.get(chave)
      if (idx !== undefined) {
        const v = visitas[idx]
        v.saidaEm = r.registradoEm
        v.duracaoMinutos = Math.round((r.registradoEm.getTime() - v.entradaEm!.getTime()) / 60_000)
        v.emAberto = false
        abertas.delete(chave)
      } else {
        visitas.push({
          supervisorId: r.supervisorId, supervisorNome: r.supervisor.nome,
          pontoId: r.pontoId, pontoNome: r.ponto.nome,
          entradaEm: null, saidaEm: r.registradoEm,
          duracaoMinutos: null, emAberto: false,
        })
      }
    }
  }

  visitas.sort((a, b) => {
    const ta = (a.entradaEm ?? a.saidaEm)!.getTime()
    const tb = (b.entradaEm ?? b.saidaEm)!.getTime()
    return tb - ta
  })

  return visitas
}
