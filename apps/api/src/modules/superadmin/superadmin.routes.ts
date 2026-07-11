import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '@opencheck/database'
import { superadminMiddleware } from '../../middleware/auth.middleware.js'
import { criarAssinatura, upgradePlano, cancelarAssinatura } from '../assinaturas/assinatura.service.js'

export async function superadminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', superadminMiddleware)

  // ── Clientes ─────────────────────────────────────────────────────────────
  app.get('/clientes', async (request) => {
    const { status, planoId } = request.query as Record<string, string>
    return prisma.tenant.findMany({
      where: {
        ...(status === 'ativo' ? { ativo: true } : {}),
        ...(planoId ? { assinatura: { planoId } } : {}),
      },
      include: { assinatura: { include: { plano: true } } },
      orderBy: { criadoEm: 'desc' },
    })
  })

  app.post('/clientes', async (request, reply) => {
    const body = request.body as {
      nome: string; email: string; cnpj?: string; telefone?: string;
      adminNome: string; adminEmail: string; adminSenha: string
    }

    const tenant = await prisma.tenant.create({
      data: {
        nome: body.nome,
        email: body.email,
        cnpj: body.cnpj,
        telefone: body.telefone,
        usuarios: {
          create: {
            nome: body.adminNome,
            email: body.adminEmail,
            senha: await bcrypt.hash(body.adminSenha, 12),
            papel: 'ADMIN',
          },
        },
        onboarding: { create: {} },
      },
    })
    return reply.status(201).send(tenant)
  })

  app.get('/clientes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { assinatura: { include: { plano: true } }, onboarding: true },
    })
    if (!tenant) return reply.status(404).send({ error: 'Cliente não encontrado' })
    return tenant
  })

  app.put('/clientes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    return prisma.tenant.update({ where: { id }, data: request.body as object })
  })

  // ── Assinaturas ───────────────────────────────────────────────────────────
  app.post('/clientes/:id/assinatura', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as Parameters<typeof criarAssinatura>[2] & { planoId: string }
    const assinatura = await criarAssinatura(id, body.planoId, body)
    return reply.status(201).send(assinatura)
  })

  app.put('/clientes/:id/assinatura/upgrade', async (request) => {
    const { id } = request.params as { id: string }
    const { planoId } = request.body as { planoId: string }
    await upgradePlano(id, planoId)
    return { success: true }
  })

  app.delete('/clientes/:id/assinatura', async (request) => {
    const { id } = request.params as { id: string }
    await cancelarAssinatura(id)
    return { success: true }
  })

  app.get('/clientes/:id/assinatura/cobrancas', async (request, reply) => {
    const { id } = request.params as { id: string }
    const assinatura = await prisma.assinatura.findUnique({ where: { tenantId: id } })
    if (!assinatura) return reply.status(404).send({ error: 'Sem assinatura' })
    return prisma.cobranca.findMany({
      where: { assinaturaId: assinatura.id },
      orderBy: { criadoEm: 'desc' },
    })
  })

  // ── WhatsApp (Z-API) por cliente ──────────────────────────────────────────
  // O admin cadastra a instância no painel Z-API e vincula aqui ao cliente.

  app.get('/clientes/:id/whatsapp', async (request, reply) => {
    const { id } = request.params as { id: string }
    const cfg = await prisma.configNotificacao.findFirst({
      where: { tenantId: id, tipo: 'WHATSAPP' },
      select: { zapiInstanceId: true, zapiToken: true, zapiClientToken: true, whatsappInstStatus: true, whatsappGrupoNome: true },
    })
    if (!cfg?.zapiInstanceId) return { vinculada: false }
    return {
      vinculada:   true,
      instanceId:  cfg.zapiInstanceId,
      // token exibido mascarado — a chave completa fica só no banco
      tokenMask:   cfg.zapiToken ? `${cfg.zapiToken.slice(0, 4)}…${cfg.zapiToken.slice(-4)}` : null,
      temClientToken: !!cfg.zapiClientToken,
      status:      cfg.whatsappInstStatus ?? 'DESCONECTADO',
      grupoNome:   cfg.whatsappGrupoNome ?? null,
    }
  })

  app.put('/clientes/:id/whatsapp', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { instanceId?: string; token?: string; clientToken?: string }
    if (!body.instanceId?.trim() || !body.token?.trim()) {
      return reply.status(400).send({ error: 'ID da instância e token são obrigatórios' })
    }

    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
    if (!tenant) return reply.status(404).send({ error: 'Cliente não encontrado' })

    const { getStatus, zapiConfigFrom } = await import('../../infra/zapi/zapi.service.js')
    const zapi = zapiConfigFrom({
      zapiInstanceId:  body.instanceId.trim(),
      zapiToken:       body.token.trim(),
      zapiClientToken: body.clientToken?.trim() || null,
    })!

    // Valida credenciais consultando o status na Z-API
    let conectado = false
    try {
      const status = await getStatus(zapi)
      conectado = status.connected
    } catch (err) {
      return reply.status(400).send({
        error: `Credenciais inválidas ou instância inacessível na Z-API: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`,
      })
    }

    await prisma.configNotificacao.upsert({
      where:  { tenantId_tipo: { tenantId: id, tipo: 'WHATSAPP' } },
      update: {
        zapiInstanceId:     body.instanceId.trim(),
        zapiToken:          body.token.trim(),
        zapiClientToken:    body.clientToken?.trim() || null,
        whatsappInstStatus: conectado ? 'CONECTADO' : 'DESCONECTADO',
        ...(conectado ? { ativo: true } : {}),
      },
      create: {
        tenantId:           id,
        tipo:               'WHATSAPP',
        ativo:              conectado,
        whatsappEventos:    [],
        zapiInstanceId:     body.instanceId.trim(),
        zapiToken:          body.token.trim(),
        zapiClientToken:    body.clientToken?.trim() || null,
        whatsappInstStatus: conectado ? 'CONECTADO' : 'DESCONECTADO',
      },
    })

    return { ok: true, status: conectado ? 'CONECTADO' : 'DESCONECTADO' }
  })

  app.delete('/clientes/:id/whatsapp', async (request) => {
    const { id } = request.params as { id: string }
    const cfg = await prisma.configNotificacao.findFirst({
      where: { tenantId: id, tipo: 'WHATSAPP' },
      select: { zapiInstanceId: true, zapiToken: true, zapiClientToken: true },
    })
    const { disconnect, zapiConfigFrom } = await import('../../infra/zapi/zapi.service.js')
    const zapi = zapiConfigFrom(cfg)
    if (zapi) await disconnect(zapi).catch(() => {})

    await prisma.configNotificacao.updateMany({
      where: { tenantId: id, tipo: 'WHATSAPP' },
      data: {
        zapiInstanceId:     null,
        zapiToken:          null,
        zapiClientToken:    null,
        whatsappInstStatus: 'DESCONECTADO',
        whatsappGrupoJid:   null,
        whatsappGrupoNome:  null,
        ativo:              false,
      },
    })
    return { ok: true }
  })

  // ── Usuários dos tenants ──────────────────────────────────────────────────
  app.get('/clientes/:id/usuarios', async (request, reply) => {
    const { id } = request.params as { id: string }
    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
    if (!tenant) return reply.status(404).send({ error: 'Cliente não encontrado' })
    return prisma.usuario.findMany({
      where: { tenantId: id },
      select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
      orderBy: { criadoEm: 'asc' },
    })
  })

  app.post('/clientes/:id/usuarios', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { nome: string; email: string; senha: string; papel?: 'ADMIN' | 'OPERADOR' }
    if (!body.nome?.trim() || !body.email?.trim() || !body.senha) {
      return reply.status(400).send({ error: 'Nome, email e senha são obrigatórios' })
    }
    if (body.senha.length < 6) return reply.status(400).send({ error: 'Senha deve ter no mínimo 6 caracteres' })

    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
    if (!tenant) return reply.status(404).send({ error: 'Cliente não encontrado' })

    const existe = await prisma.usuario.findUnique({ where: { email: body.email } })
    if (existe) return reply.status(409).send({ error: 'Já existe um usuário com este email' })

    const usuario = await prisma.usuario.create({
      data: {
        tenantId: id,
        nome:  body.nome.trim(),
        email: body.email.trim(),
        senha: await bcrypt.hash(body.senha, 12),
        papel: body.papel ?? 'OPERADOR',
      },
      select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
    })
    return reply.status(201).send(usuario)
  })

  app.put('/clientes/:id/usuarios/:usuarioId', async (request, reply) => {
    const { id, usuarioId } = request.params as { id: string; usuarioId: string }
    const body = request.body as { nome?: string; papel?: 'ADMIN' | 'OPERADOR'; ativo?: boolean }

    const usuario = await prisma.usuario.findFirst({ where: { id: usuarioId, tenantId: id } })
    if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado' })

    return prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        ...(body.nome !== undefined ? { nome: body.nome } : {}),
        ...(body.papel !== undefined ? { papel: body.papel } : {}),
        ...(body.ativo !== undefined ? { ativo: body.ativo } : {}),
      },
      select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
    })
  })

  app.post('/clientes/:id/usuarios/:usuarioId/resetar-senha', async (request, reply) => {
    const { id, usuarioId } = request.params as { id: string; usuarioId: string }
    const { senha } = request.body as { senha: string }
    if (!senha || senha.length < 6) return reply.status(400).send({ error: 'Senha deve ter no mínimo 6 caracteres' })

    const usuario = await prisma.usuario.findFirst({ where: { id: usuarioId, tenantId: id } })
    if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado' })

    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { senha: await bcrypt.hash(senha, 12) },
    })
    return { success: true }
  })

  // ── Planos ────────────────────────────────────────────────────────────────
  app.get('/planos', async () => prisma.plano.findMany({ orderBy: { criadoEm: 'asc' } }))

  app.post('/planos', async (request, reply) => {
    const body = request.body as { nome: string; descricao?: string; valorMensal: number; valorAnual?: number; pontosIncluidos: number; limiteUsuarios?: number }
    const plano = await prisma.plano.create({ data: body })
    return reply.status(201).send(plano)
  })

  app.put('/planos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as { nome?: string; descricao?: string; valorMensal?: number; valorAnual?: number | null; pontosIncluidos?: number; limiteUsuarios?: number; ativo?: boolean }
    const plano = await prisma.plano.findUnique({ where: { id } })
    if (!plano) return reply.status(404).send({ error: 'Plano não encontrado' })
    return prisma.plano.update({ where: { id }, data: body })
  })

  // ── Configuração global de eventos (códigos CTRL+SAFE por TipoEvento) ────────
  app.get('/eventos-config', async () => {
    const cfg = await prisma.configEventoGlobal.findUnique({ where: { id: 'global' } })
    if (!cfg) {
      return prisma.configEventoGlobal.create({
        data: { id: 'global' },
      })
    }
    return cfg
  })

  app.put('/eventos-config', async (request) => {
    const body = request.body as { codigos?: Record<string, string>; tiposCtrlSafe?: Record<string, string> }
    return prisma.configEventoGlobal.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...body },
      update: body,
    })
  })

  // ── Overview ──────────────────────────────────────────────────────────────
  app.get('/overview', async () => {
    const [totalTenants, totalAtivos, totalInadimplentes, totalReceita] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { ativo: true } }),
      prisma.assinatura.count({ where: { status: 'INADIMPLENTE' } }),
      prisma.cobranca.aggregate({ _sum: { valor: true }, where: { status: { in: ['CONFIRMADA', 'RECEBIDA'] } } }),
    ])
    return { totalTenants, totalAtivos, totalInadimplentes, totalReceita: totalReceita._sum.valor ?? 0 }
  })
}
