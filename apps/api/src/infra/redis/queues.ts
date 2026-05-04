import { Queue } from 'bullmq'
import { redisConnection } from './redis.client.js'

export const webhookQueue = new Queue('webhook', { connection: redisConnection })
export const cicloAlertaQueue = new Queue('ciclo-alerta', { connection: redisConnection })
export const notificacaoQueue = new Queue('notificacao', { connection: redisConnection })
