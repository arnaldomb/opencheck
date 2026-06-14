import { Worker } from 'bullmq'
import { prisma } from '@opencheck/database'
import { redisConnection } from '../infra/redis/redis.client.js'
import { sendWhatsAppText, sendWhatsAppMedia } from '../infra/evogo/evogo.service.js'
import { sendCtrlSafeEvent, CTRLSAFE_EVENT_TYPE } from '../infra/ctrlsafe/ctrlsafe.service.js'

const TIPO_PT: Record<string, string> = {
  PANICO:            '🚨 PÂNICO',
  PANICO_SILENCIOSO: '🚨 PÂNICO SILENCIOSO',
  COACAO:            '⚠️ COAÇÃO',
  FALHA:             '🔴 FALHA DE DISPOSITIVO',
  CHECKIN:           '✅ CHECK-IN',
  ALERTA:            '🔴 ALERTA — SEM CHECK-IN',
}

const TIPO_CODIGO: Record<string, string> = {
  PANICO: '1120', PANICO_SILENCIOSO: '1122', COACAO: '1121',
  FALHA: '1130', CHECKIN: '1602', ALERTA: '1130',
}

const PANICO_TIPOS = new Set(['PANICO', 'PANICO_SILENCIOSO', 'COACAO', 'FALHA', 'ALERTA'])

export function notificacaoWorker(): void {
  new Worker('notificacao', async (job) => {
    const { tenantId, pontoId, eventoId, tipo, mensagem } = job.data as {
      tenantId: string
      pontoId?: string
      eventoId?: string
      tipo: string
      mensagem?: string
    }

    const [wppCfg, ctrlAtivo, ponto] = await Promise.all([
      prisma.configNotificacao.findFirst({
        where: { tenantId, tipo: 'WHATSAPP', ativo: true },
        select: {
          whatsappDestino:    true,
          whatsappGrupoJid:   true,
          whatsappEventos:    true,
          evolutionUrl:       true,
          evolutionApiKey:    true,
          evolutionInstanceToken: true,
          evolutionInstance:  true,
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
    ])

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

    // ── WhatsApp ──────────────────────────────────────────────────────────────
    const wppEventos    = wppCfg?.whatsappEventos ?? []
    const deveEnviar    = wppEventos.length === 0 || wppEventos.includes(tipo)
    const temInstancia  = wppCfg?.evolutionInstance && wppCfg?.evolutionUrl && (wppCfg?.evolutionInstanceToken || wppCfg?.evolutionApiKey)
    const estaConectado = wppCfg?.whatsappInstStatus === 'CONECTADO'
    const temDestino    = !!(wppCfg?.whatsappDestino || wppCfg?.whatsappGrupoJid)

    if (temInstancia && estaConectado && deveEnviar && temDestino) {
      const evoConfig = {
        url:      wppCfg!.evolutionUrl!,
        apiKey:   wppCfg!.evolutionInstanceToken ?? wppCfg!.evolutionApiKey!,
        instance: wppCfg!.evolutionInstance!,
      }

      let text = mensagem
      if (!text) {
        const tipoLabel = TIPO_PT[tipo] ?? tipo
        const sufixo    = tipo === 'CHECKIN'
          ? 'Check-in efetuado dentro do horário.'
          : 'Verifique imediatamente.'
        text = `${tipoLabel}\n📍 ${ponto?.nome ?? 'Ponto'}\n🕐 ${now}\n\n${sufixo}`
      }

      // Buscar snapshot (para eventos críticos aguardar até 25s)
      let snapshot = null
      if (eventoId) {
        if (PANICO_TIPOS.has(tipo)) {
          for (let i = 0; i < 5; i++) {
            snapshot = await prisma.snapshot.findFirst({ where: { eventoId } })
            if (snapshot?.imageUrl) break
            await new Promise(r => setTimeout(r, 5_000))
          }
        } else {
          snapshot = await prisma.snapshot.findFirst({ where: { eventoId } })
        }
      }

      // Enviar para número individual
      if (wppCfg!.whatsappDestino) {
        try {
          await sendWhatsAppText(evoConfig, wppCfg!.whatsappDestino, text)
          if (snapshot?.imageUrl) {
            await sendWhatsAppMedia(evoConfig, wppCfg!.whatsappDestino, snapshot.imageUrl, '📸 Snapshot do evento').catch(() => {})
          }
          console.info(`[notif] WhatsApp → número ${wppCfg!.whatsappDestino} — tipo: ${tipo}`)
        } catch (err) {
          console.error('[notif] Falha WhatsApp número:', err)
        }
      }

      // Enviar para grupo
      if (wppCfg!.whatsappGrupoJid) {
        try {
          await sendWhatsAppText(evoConfig, wppCfg!.whatsappGrupoJid, text)
          if (snapshot?.imageUrl) {
            await sendWhatsAppMedia(evoConfig, wppCfg!.whatsappGrupoJid, snapshot.imageUrl, '📸 Snapshot do evento').catch(() => {})
          }
          console.info(`[notif] WhatsApp → grupo ${wppCfg!.whatsappGrupoJid} — tipo: ${tipo}`)
        } catch (err) {
          console.error('[notif] Falha WhatsApp grupo:', err)
        }
      }
    }

    // ── CTRL+SAFE ─────────────────────────────────────────────────────────────
    if (ctrlAtivo && ponto?.ctrlsafeAgentToken && ponto?.ctrlsafeInstallId && ponto?.ctrlsafeAccount) {
      try {
        const eventType = CTRLSAFE_EVENT_TYPE[tipo] ?? 'alert'
        const payload = {
          receiver:  ponto.ctrlsafeReceiver  ?? '001',
          line:      ponto.ctrlsafeLine      ?? '01',
          account:   ponto.ctrlsafeAccount,
          event:     TIPO_CODIGO[tipo]       ?? '1130',
          partition: ponto.ctrlsafePartition ?? '01',
          zone:      ponto.ctrlsafeZone      ?? '099',
        }
        await sendCtrlSafeEvent(ponto.ctrlsafeAgentToken, ponto.ctrlsafeInstallId, eventType, payload)
        console.info(`[notif] CTRL+SAFE enviado — tipo: ${tipo}, account: ${ponto.ctrlsafeAccount}`)
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
