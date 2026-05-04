import { FastifyRequest, FastifyReply } from 'fastify'

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ error: 'Token inválido ou expirado' })
  }
}

export async function superadminMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authMiddleware(request, reply)
  const user = request.user as { role?: string }
  if (user?.role !== 'superadmin') {
    return reply.status(403).send({ error: 'Acesso restrito ao superadmin' })
  }
}
