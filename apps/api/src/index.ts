import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import { prisma } from '@opencheck/database'

import { authRoutes } from './modules/auth/auth.routes.js'
import { superadminRoutes } from './modules/superadmin/superadmin.routes.js'
import { pontosRoutes } from './modules/pontos/pontos.routes.js'
import { ciclosRoutes } from './modules/ciclos/ciclos.routes.js'
import { assinaturasRoutes } from './modules/assinaturas/assinaturas.routes.js'
import { notificacoesRoutes } from './modules/notificacoes/notificacoes.routes.js'
import { configuracoesRoutes } from './modules/configuracoes/configuracoes.routes.js'
import { camerasRoutes } from './modules/cameras/cameras.routes.js'
import { eventosRoutes } from './modules/eventos/eventos.routes.js'
import { webhookRoutes } from './modules/webhooks/webhook.routes.js'
import { operadoresRoutes } from './modules/operadores/operadores.routes.js'
import { fieldApiRoutes } from './modules/field-api/field-api.routes.js'
import { relatoriosRoutes } from './modules/relatorios/relatorios.routes.js'
import { initSocket } from './infra/socket/socket.js'
import { startJobs } from './jobs/index.js'
import { ensureStorageBucket } from './infra/storage/storage.service.js'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
  },
})

await app.register(helmet, { contentSecurityPolicy: false })
await app.register(cors, {
  origin: process.env.APP_URL ?? 'http://localhost:3000',
  credentials: true,
})
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})
await app.register(jwt, {
  secret: {
    private: process.env.JWT_SECRET!,
    public: process.env.JWT_SECRET!,
  },
})

app.addHook('onClose', async () => {
  await prisma.$disconnect()
})

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

await app.register(authRoutes, { prefix: '/auth' })
await app.register(webhookRoutes, { prefix: '/webhooks' })
await app.register(superadminRoutes, { prefix: '/superadmin' })
await app.register(assinaturasRoutes, { prefix: '/plano' })
await app.register(pontosRoutes, { prefix: '/pontos' })
await app.register(ciclosRoutes, { prefix: '/ciclo' })
await app.register(notificacoesRoutes, { prefix: '/config/notificacoes' })
await app.register(configuracoesRoutes, { prefix: '/configuracoes' })
await app.register(camerasRoutes, { prefix: '/cameras' })
await app.register(eventosRoutes, { prefix: '/eventos' })
await app.register(operadoresRoutes, { prefix: '/operadores' })
await app.register(fieldApiRoutes, { prefix: '/api/field/v1' })
await app.register(relatoriosRoutes, { prefix: '/relatorios' })

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '0.0.0.0'

await app.listen({ port, host })

initSocket(app.server)

await ensureStorageBucket().catch(err => console.warn('[storage] MinIO not ready:', err.message))
await startJobs()

app.log.info(`API rodando em http://${host}:${port}`)
