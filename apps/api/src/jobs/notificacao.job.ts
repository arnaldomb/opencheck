import { Worker } from 'bullmq'
import { prisma } from '@opencheck/database'
import { redisConnection } from '../infra/redis/redis.client.js'
import { sendWhatsAppText, zapiConfigFrom } from '../infra/zapi/zapi.service.js'
import { sendCtrlSafeEvent, CTRLSAFE_EVENT_TYPE } from '../infra/ctrlsafe/ctrlsafe.service.js'

const TZ = 'America/Sao_Paulo'

const TIPO_CODIGO_FALLBACK: Record<string, string> = {
  PANICO: '1120', PANICO_SILENCIOSO: '1122', COACAO: '1121',
  FALHA: '1130', CHECKIN: '1602', ALERTA: '1130',
  ABERTURA_CHECKIN: '1400', ABERTURA_AUSENTE: '1402',
  FECHAMENTO_CHECKIN: '1410', FECHAMENTO_AUSENTE: '1412',
  SUPERVISOR_ENTRADA: '1420', SUPERVISOR_SAIDA: '1421',
  AVISO: '1140', RESTAURACAO: '1150', TESTE: '1602',
}

const PANICO_TIPOS = new Set(['PANICO', 'PANICO_SILENCIOSO', 'COACAO', 'FALHA', 'ALERTA'])

function dataHoraMensagem(): string {
  const data = new Date()
  const dataFmt = data.toLocaleDateString('pt-BR', { timeZone: TZ })
  const horaFmt = data.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
  return `${dataFmt} às ${horaFmt}`
}

function buildMensagemCorporativa(opts: {
  titulo: string
  introducao: string
  empresa: string
  ponto: string
  operador: string | null
  fechamento: string
}): string {
  const { titulo, introducao, empresa, ponto, operador, fechamento } = opts
  const op = operador ?? 'Não identificado'

  return (
    `${titulo}\n\n` +
    `${introducao}\n\n` +
    `Empresa: ${empresa}\n` +
    `Unidade: ${ponto}\n` +
    `Responsável: ${op}\n` +
    `Data/Hora: ${dataHoraMensagem()}\n\n` +
    `${fechamento}`
  )
}

function buildMensagem(opts: {
  tipo: string
  empresa: string
  ponto: string
  operador: string | null
  statusAbertura?: string | null
  statusFechamento?: string | null
  horaAbertura?: string | null
  toleranciaMinutos?: number | null
  deadlineBRT?: string | null
}): string {
  const { tipo, empresa, ponto, operador, statusAbertura, statusFechamento } = opts

  switch (tipo) {
    case 'CHECKIN':
      return buildMensagemCorporativa({
        titulo: '✅ *CHECK-IN CONFIRMADO*',
        introducao: 'O check-in da unidade foi registrado com sucesso no sistema.',
        empresa,
        ponto,
        operador,
        fechamento: 'Registro operacional concluído com sucesso.',
      })

    case 'ABERTURA_CHECKIN': {
      if (statusAbertura === 'NO_PRAZO') {
        return buildMensagemCorporativa({
          titulo: '✅ *CHECK-IN DE ABERTURA CONFIRMADO*',
          introducao: 'A abertura da unidade foi realizada dentro do período operacional estabelecido.',
          empresa,
          ponto,
          operador,
          fechamento: 'Conformidade operacional registrada com sucesso.',
        })
      }

      return buildMensagemCorporativa({
        titulo: '⚠️ *CHECK-IN DE ABERTURA COM ATRASO*',
        introducao: 'A abertura da unidade foi registrada fora do período operacional estabelecido.',
        empresa,
        ponto,
        operador,
        fechamento: 'Ocorrência registrada para acompanhamento operacional.',
      })
    }

    case 'FECHAMENTO_CHECKIN': {
      if (statusFechamento === 'ATRASADO') {
        return buildMensagemCorporativa({
          titulo: '⚠️ *CHECK-OUT DE FECHAMENTO COM ATRASO*',
          introducao: 'O fechamento da unidade foi registrado fora do período operacional estabelecido.',
          empresa,
          ponto,
          operador,
          fechamento: 'Ocorrência registrada para acompanhamento operacional.',
        })
      }

      return buildMensagemCorporativa({
        titulo: '✅ *CHECK-OUT DE FECHAMENTO CONFIRMADO*',
        introducao: 'O fechamento da unidade foi realizado dentro do período operacional estabelecido.',
        empresa,
        ponto,
        operador,
        fechamento: 'Conformidade operacional registrada com sucesso.',
      })
    }

    case 'FECHAMENTO_AUSENTE':
      return buildMensagemCorporativa({
        titulo: '🚨 *ALERTA DE FALTA DE FECHAMENTO*',
        introducao: 'Não foi identificado o check-out de fechamento da unidade dentro do período operacional esperado.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos a verificação imediata da situação para garantir o cumprimento dos procedimentos operacionais.',
      })

    case 'PANICO':
      return buildMensagemCorporativa({
        titulo: '🚨 *ALERTA DE PÂNICO*',
        introducao: 'Foi registrado um acionamento de pânico na unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos atuação imediata conforme os protocolos de emergência.',
      })

    case 'PANICO_SILENCIOSO':
      return buildMensagemCorporativa({
        titulo: '🚨 *ALERTA DE PÂNICO SILENCIOSO*',
        introducao: 'Foi registrado um acionamento silencioso na unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos atuação discreta e imediata, sem contato direto com a unidade.',
      })

    case 'COACAO':
      return buildMensagemCorporativa({
        titulo: '⚠️ *ALERTA DE COAÇÃO*',
        introducao: 'Foi identificado um possível cenário de coação envolvendo a unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos verificação imediata com abordagem discreta, sem contato direto com a unidade.',
      })

    case 'ALERTA':
      return buildMensagemCorporativa({
        titulo: '� *ALERTA DE CHECK-IN NÃO REALIZADO*',
        introducao: 'Não foi identificado check-in da unidade dentro do período operacional esperado.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos a verificação imediata da situação para garantir o cumprimento dos procedimentos operacionais.',
      })

    case 'ABERTURA_AUSENTE':
      return buildMensagemCorporativa({
        titulo: '🚨 *ALERTA DE FALTA DE ABERTURA*',
        introducao: 'Foi identificado atraso na abertura da unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos a verificação imediata da situação para garantir o cumprimento dos procedimentos operacionais.',
      })

    case 'SUPERVISOR_ENTRADA':
      return (
        '🛡️ *SUPERVISOR NA UNIDADE*\n\n' +
        'O supervisor iniciou a visita de supervisão na unidade.\n\n' +
        `Empresa: ${empresa}\n` +
        `Unidade: ${ponto}\n` +
        `Supervisor: ${operador ?? 'Não identificado'}\n` +
        `Chegada: ${dataHoraMensagem()}\n\n` +
        'Registro de entrada confirmado no sistema.'
      )

    case 'SUPERVISOR_SAIDA':
      return (
        '✅ *VISITA DE SUPERVISÃO CONCLUÍDA*\n\n' +
        'O supervisor finalizou a visita à unidade.\n\n' +
        `Empresa: ${empresa}\n` +
        `Unidade: ${ponto}\n` +
        `Supervisor: ${operador ?? 'Não identificado'}\n` +
        `Saída: ${dataHoraMensagem()}\n\n` +
        'Registro de saída confirmado no sistema.'
      )

    default:
      return buildMensagemCorporativa({
        titulo: `ℹ️ *${tipo}*`,
        introducao: 'Foi registrada uma ocorrência operacional na unidade.',
        empresa,
        ponto,
        operador,
        fechamento: 'Solicitamos acompanhamento da ocorrência conforme os procedimentos definidos.',
      })
  }
}

export function notificacaoWorker(): void {
  new Worker('notificacao', async (job) => {
    const { tenantId, pontoId, eventoId, tipo, mensagem, codigoEvento: codigoJob } = job.data as {
      tenantId: string
      pontoId?: string
      eventoId?: string
      tipo: string
      mensagem?: string
      codigoEvento?: string
    }

    const [wppCfg, ctrlAtivo, ponto, tenant, evento, cfgGlobal] = await Promise.all([
      prisma.configNotificacao.findFirst({
        where: { tenantId, tipo: 'WHATSAPP', ativo: true },
        select: {
          whatsappDestino:    true,
          whatsappGrupoJid:   true,
          whatsappEventos:    true,
          zapiInstanceId:     true,
          zapiToken:          true,
          zapiClientToken:    true,
          whatsappInstStatus: true,
        },
      }),
      prisma.configNotificacao.findFirst({
        where: { tenantId, tipo: 'CTRLSAFE', ativo: true },
        select: { id: true },
      }),
      pontoId
        ? prisma.ponto.findUnique({
            where: { id: pontoId },
            select: {
              nome: true,
              ctrlsafeAccount: true, ctrlsafePartition: true,
              ctrlsafeZone: true, ctrlsafeReceiver: true, ctrlsafeLine: true,
              ctrlsafeAgentToken: true, ctrlsafeInstallId: true,
            },
          })
        : null,
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { nome: true } }),
      eventoId
        ? prisma.evento.findUnique({ where: { id: eventoId }, select: { meta: true } })
        : null,
      prisma.configEventoGlobal.findUnique({ where: { id: 'global' } }),
    ])

    // Resolve nome do operador/supervisor a partir do meta do evento
    let nomeOperador: string | null = null
    const meta = evento?.meta as Record<string, unknown> | null
    const operadorId   = meta?.operadorId as string | undefined
    const supervisorId = meta?.supervisorId as string | undefined
    if (operadorId) {
      const op = await prisma.operador.findUnique({ where: { id: operadorId }, select: { nome: true } })
      nomeOperador = op?.nome ?? null
    } else if (supervisorId) {
      const sup = await prisma.supervisor.findUnique({ where: { id: supervisorId }, select: { nome: true } })
      nomeOperador = sup?.nome ?? null
    }

    const statusAbertura   = (meta?.statusAbertura   as string | undefined) ?? null
    const statusFechamento = (meta?.statusFechamento as string | undefined) ?? null

    // ── WhatsApp ──────────────────────────────────────────────────────────────
    const wppEventos    = wppCfg?.whatsappEventos ?? []
    // Check-ins de abertura/fechamento contam como o evento "CHECKIN" da config do cliente
    const tipoFiltro    = tipo === 'ABERTURA_CHECKIN' || tipo === 'FECHAMENTO_CHECKIN' ? 'CHECKIN' : tipo
    const deveEnviar    = tipo !== 'FALHA' && (wppEventos.length === 0 || wppEventos.includes(tipo) || wppEventos.includes(tipoFiltro))
    const zapiCfg       = zapiConfigFrom(wppCfg)
    const estaConectado = wppCfg?.whatsappInstStatus === 'CONECTADO'
    const temDestino    = !!(wppCfg?.whatsappDestino || wppCfg?.whatsappGrupoJid)

    if (zapiCfg && estaConectado && deveEnviar && temDestino) {
      const evoConfig = zapiCfg

      // Usa mensagem customizada (e.g. ABERTURA_AUSENTE do deadline job) ou constrói a padrão
      const text = mensagem ?? buildMensagem({
        tipo,
        empresa: tenant?.nome ?? 'Empresa',
        ponto:   ponto?.nome  ?? 'Ponto',
        operador: nomeOperador,
        statusAbertura,
        statusFechamento,
      })
      if (wppCfg!.whatsappDestino) {
        try {
          await sendWhatsAppText(evoConfig, wppCfg!.whatsappDestino, text)
          console.info(`[notif] WhatsApp → número ${wppCfg!.whatsappDestino} — tipo: ${tipo}`)
        } catch (err) {
          console.error('[notif] Falha WhatsApp número:', err)
        }
      }

      if (wppCfg!.whatsappGrupoJid) {
        try {
          await sendWhatsAppText(evoConfig, wppCfg!.whatsappGrupoJid, text)
          console.info(`[notif] WhatsApp → grupo ${wppCfg!.whatsappGrupoJid} — tipo: ${tipo}`)
        } catch (err) {
          console.error('[notif] Falha WhatsApp grupo:', err)
        }
      }
    }

    // ── CTRL+SAFE ─────────────────────────────────────────────────────────────
    if (ctrlAtivo && ponto?.ctrlsafeAgentToken && ponto?.ctrlsafeInstallId && ponto?.ctrlsafeAccount) {
      try {
        // Prioridade: código do job (setado pelo service) > meta do evento > config global > fallback hardcoded
        const globalCodigos   = (cfgGlobal?.codigos    as Record<string, string> | null) ?? {}
        const globalTipos     = (cfgGlobal?.tiposCtrlSafe as Record<string, string> | null) ?? {}
        const codigoFinal     = codigoJob
          ?? (meta?.codigoEvento as string | undefined)
          ?? globalCodigos[tipo]
          ?? TIPO_CODIGO_FALLBACK[tipo]
          ?? '1130'
        const eventType = globalTipos[tipo] ?? CTRLSAFE_EVENT_TYPE[tipo] ?? 'alert'
        const payload = {
          receiver:  ponto.ctrlsafeReceiver  ?? '001',
          line:      ponto.ctrlsafeLine      ?? '01',
          account:   ponto.ctrlsafeAccount,
          event:     codigoFinal,
          partition: ponto.ctrlsafePartition ?? '01',
          zone:      ponto.ctrlsafeZone      ?? '099',
        }
        await sendCtrlSafeEvent(ponto.ctrlsafeAgentToken, ponto.ctrlsafeInstallId, eventType, payload)
        console.info(`[notif] CTRL+SAFE enviado — tipo: ${tipo}, codigo: ${codigoFinal}, account: ${ponto.ctrlsafeAccount}`)
        if (eventoId) {
          await prisma.evento.update({ where: { id: eventoId }, data: { monitorado: true } }).catch(() => {})
        }
      } catch (err) {
        console.error('[notif] Falha CTRL+SAFE:', err)
      }
    }

    if (eventoId) {
      await prisma.evento.update({ where: { id: eventoId }, data: { encaminhado: true } }).catch(() => {})
    }
  }, { connection: redisConnection, concurrency: 3 })
}
