import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '@opencheck/database'

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const { email, senha } = request.body as { email: string; senha: string }

    // Tentar superadmin primeiro
    const superadmin = await prisma.superadmin.findUnique({ where: { email } })
    if (superadmin && await bcrypt.compare(senha, superadmin.senha)) {
      const token = app.jwt.sign({ sub: superadmin.id, role: 'superadmin' }, { expiresIn: '15m' })
      const refresh = app.jwt.sign({ sub: superadmin.id, role: 'superadmin', type: 'refresh' }, { expiresIn: '7d' })
      return { token, refresh, role: 'superadmin' }
    }

    // Tentar usuario de tenant
    const usuario = await prisma.usuario.findUnique({ where: { email }, include: { tenant: true } })
    if (!usuario || !await bcrypt.compare(senha, usuario.senha)) {
      return reply.status(401).send({ error: 'Credenciais inválidas' })
    }
    if (!usuario.ativo || !usuario.tenant.ativo) {
      return reply.status(401).send({ error: 'Conta inativa' })
    }

    const token = app.jwt.sign(
      { sub: usuario.id, tenantId: usuario.tenantId, role: usuario.papel.toLowerCase() },
      { expiresIn: '15m' },
    )
    const refresh = app.jwt.sign(
      { sub: usuario.id, tenantId: usuario.tenantId, role: usuario.papel.toLowerCase(), type: 'refresh' },
      { expiresIn: '7d' },
    )
    return { token, refresh, role: usuario.papel }
  })

  app.post('/refresh', async (request, reply) => {
    const { refresh } = request.body as { refresh: string }
    try {
      const payload = app.jwt.verify<{ sub: string; tenantId?: string; role?: string; type: string }>(refresh)
      if (payload.type !== 'refresh') return reply.status(401).send({ error: 'Token inválido' })

      const claims: Record<string, unknown> = { sub: payload.sub }
      if (payload.tenantId) claims.tenantId = payload.tenantId
      if (payload.role)     claims.role     = payload.role

      const token = app.jwt.sign(claims, { expiresIn: '15m' })
      return { token }
    } catch {
      return reply.status(401).send({ error: 'Refresh token expirado' })
    }
  })

  app.post('/logout', async () => ({ success: true }))
}
