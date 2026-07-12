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
  // Supervisor não fez check-out: a visita foi encerrada junto com o
  // fechamento da loja (saidaEm = fechamentoEm do RegistroAbertura do dia).
  fechamentoAutomatico: boolean
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
        duracaoMinutos: null, emAberto: true, fechamentoAutomatico: false,
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
          duracaoMinutos: null, emAberto: false, fechamentoAutomatico: false,
        })
      }
    }
  }

  // Visita sem check-out é encerrada junto com o fechamento da loja:
  // saída = fechamentoEm do RegistroAbertura do dia da entrada. Se a loja
  // ainda não fechou, a visita permanece "em aberto".
  const pendentes = visitas.filter(v => v.emAberto && v.entradaEm)
  if (pendentes.length > 0) {
    const TZ = 'America/Sao_Paulo'
    const dataSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })

    const fechamentos = await prisma.registroAbertura.findMany({
      where: {
        tenantId,
        pontoId: { in: [...new Set(pendentes.map(v => v.pontoId))] },
        fechamentoEm: { not: null },
        data: {
          gte: new Date(`${dataSP(opts.dataInicio)}T00:00:00.000Z`),
          lte: new Date(`${dataSP(opts.dataFim)}T00:00:00.000Z`),
        },
      },
      select: { pontoId: true, data: true, fechamentoEm: true },
    })
    const fechamentoPorDia = new Map(
      fechamentos.map(f => [`${f.pontoId}:${f.data.toISOString().slice(0, 10)}`, f.fechamentoEm!]),
    )

    for (const v of pendentes) {
      const fechamentoEm = fechamentoPorDia.get(`${v.pontoId}:${dataSP(v.entradaEm!)}`)
      if (fechamentoEm && fechamentoEm > v.entradaEm!) {
        v.saidaEm = fechamentoEm
        v.duracaoMinutos = Math.round((fechamentoEm.getTime() - v.entradaEm!.getTime()) / 60_000)
        v.emAberto = false
        v.fechamentoAutomatico = true
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
