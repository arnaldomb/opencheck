import {
  PrismaClient, AssinaturaStatus, Periodicidade,
  TipoEvento, CanalAlerta, Papel, CicloStatus,
} from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()

function diasAtras(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d
}
function horasAtras(n: number) {
  const d = new Date(); d.setHours(d.getHours() - n); return d
}
function agentKey(suffix: string): string {
  return `oc_tst_${suffix.slice(0, 8).toUpperCase()}`
}

async function main() {
  console.log('🌱 Iniciando seed...')

  // ── SUPERADMIN ─────────────────────────────────────────────────────────────
  const superadminEmail = process.env.SUPERADMIN_EMAIL ?? 'admin@opencheck.com.br'
  const superadminSenha = process.env.SUPERADMIN_SENHA ?? 'Admin@2024!'
  await prisma.superadmin.upsert({
    where:  { email: superadminEmail },
    update: { senha: await bcrypt.hash(superadminSenha, 12) },
    create: { email: superadminEmail, nome: 'Superadmin', senha: await bcrypt.hash(superadminSenha, 12) },
  })
  console.log('  ✅ Superadmin criado')

  // ── PLANOS ─────────────────────────────────────────────────────────────────
  const [planoStarter, planoPro] = await Promise.all([
    prisma.plano.upsert({
      where: { id: 'plano-starter' }, update: {},
      create: {
        id: 'plano-starter', nome: 'Starter',
        descricao: 'Ideal para pequenas empresas',
        pontosIncluidos: 3, valorMensal: 199.9, valorAnual: 1999.0,
        limiteUsuarios: 5,
      },
    }),
    prisma.plano.upsert({
      where: { id: 'plano-profissional' }, update: {},
      create: {
        id: 'plano-profissional', nome: 'Profissional',
        descricao: 'Para empresas em crescimento',
        pontosIncluidos: 10, valorMensal: 499.9, valorAnual: 4999.0,
        limiteUsuarios: 20,
      },
    }),
    prisma.plano.upsert({
      where: { id: 'plano-enterprise' }, update: {},
      create: {
        id: 'plano-enterprise', nome: 'Enterprise',
        descricao: 'Sem limites para grandes operações',
        pontosIncluidos: 50, valorMensal: 1499.9, valorAnual: 14999.0,
        limiteUsuarios: 100,
      },
    }),
  ])
  console.log('  ✅ Planos criados')

  // ── TENANT 1 — Segurança Total ─────────────────────────────────────────────
  const tenant1 = await prisma.tenant.upsert({
    where: { email: 'contato@segurancatotal.com.br' }, update: {},
    create: {
      id: 'tenant-seguranca-total', nome: 'Segurança Total Ltda',
      cnpj: '12.345.678/0001-90', email: 'contato@segurancatotal.com.br',
      telefone: '+55 11 3456-7890', ativo: true, onboardingOk: true,
    },
  })

  await prisma.assinatura.upsert({
    where: { tenantId: tenant1.id }, update: {},
    create: {
      tenantId: tenant1.id, planoId: planoPro.id,
      periodicidade: Periodicidade.MENSAL, status: AssinaturaStatus.ATIVA,
      pontosContratados: 10,
      proximaCobrancaEm: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      externalReference: 'ext-tenant-seguranca-total',
    },
  })

  const senhaAdmin1 = await bcrypt.hash('Admin@2024!', 12)
  await prisma.usuario.upsert({
    where: { email: 'admin@segurancatotal.com.br' },
    update: { senha: senhaAdmin1 },
    create: {
      tenantId: tenant1.id, email: 'admin@segurancatotal.com.br',
      nome: 'Carlos Mendes', papel: Papel.ADMIN, senha: senhaAdmin1,
    },
  })
  const senhaOp1 = await bcrypt.hash('Operador@2024!', 12)
  await prisma.usuario.upsert({
    where: { email: 'operador@segurancatotal.com.br' },
    update: { senha: senhaOp1 },
    create: {
      tenantId: tenant1.id, email: 'operador@segurancatotal.com.br',
      nome: 'Ana Paula Santos', papel: Papel.OPERADOR, senha: senhaOp1,
    },
  })

  // Pontos — com agentKey
  const ponto1 = await prisma.ponto.upsert({
    where: { id: 'ponto-portaria-principal' },
    update: {
      nome: 'Loja 1',
      descricao: 'Ponto de monitoramento da Loja 1',
      agentKey: agentKey('ponto1portariaprincipal'),
      agentKeyAt: new Date(),
    },
    create: {
      id: 'ponto-portaria-principal', tenantId: tenant1.id,
      nome: 'Loja 1', descricao: 'Ponto de monitoramento da Loja 1',
      endereco: 'Av. Paulista, 1000 – São Paulo/SP', ativo: true,
      canalAlerta: CanalAlerta.WHATSAPP,
      agentKey: agentKey('ponto1portariaprincipal'), agentKeyAt: new Date(),
    },
  })
  const ponto2 = await prisma.ponto.upsert({
    where: { id: 'ponto-portaria-secundaria' },
    update: {
      nome: 'Loja 2',
      descricao: 'Ponto de monitoramento da Loja 2',
      agentKey: agentKey('ponto2portariasecundaria'),
      agentKeyAt: new Date(),
    },
    create: {
      id: 'ponto-portaria-secundaria', tenantId: tenant1.id,
      nome: 'Loja 2', descricao: 'Ponto de monitoramento da Loja 2',
      endereco: 'Av. Paulista, 1000 – São Paulo/SP', ativo: true,
      canalAlerta: CanalAlerta.WHATSAPP,
      agentKey: agentKey('ponto2portariasecundaria'), agentKeyAt: new Date(),
    },
  })
  const ponto3 = await prisma.ponto.upsert({
    where: { id: 'ponto-guarita-estacionamento' },
    update: {
      nome: 'Loja 3',
      descricao: 'Ponto de monitoramento da Loja 3',
      agentKey: agentKey('ponto3guaritaestacionamento'),
      agentKeyAt: new Date(),
    },
    create: {
      id: 'ponto-guarita-estacionamento', tenantId: tenant1.id,
      nome: 'Loja 3', descricao: 'Ponto de monitoramento da Loja 3',
      endereco: 'Av. Paulista, 1000 – São Paulo/SP', ativo: true,
      canalAlerta: CanalAlerta.WHATSAPP,
      agentKey: agentKey('ponto3guaritaestacionamento'), agentKeyAt: new Date(),
    },
  })

  // Operadores — com agentKey
  // Upsert pela agentKey (única) — id é cuid gerado pelo Prisma
  await prisma.operador.upsert({
    where: { agentKey: agentKey('vig1joaosilva') },
    update: { agentKeyAt: new Date(), pontos: { connect: { id: ponto1.id } } },
    create: {
      tenantId: tenant1.id,
      nome: 'João Silva', telefone: '+55 11 99123-4567', ativo: true,
      agentKey: agentKey('vig1joaosilva'), agentKeyAt: new Date(),
      pontos: { connect: { id: ponto1.id } },
    },
  })
  await prisma.operador.upsert({
    where: { agentKey: agentKey('vig2marcosoliveira') },
    update: { agentKeyAt: new Date(), pontos: { connect: { id: ponto2.id } } },
    create: {
      tenantId: tenant1.id,
      nome: 'Marcos Oliveira', telefone: '+55 11 99234-5678', ativo: true,
      agentKey: agentKey('vig2marcosoliveira'), agentKeyAt: new Date(),
      pontos: { connect: { id: ponto2.id } },
    },
  })
  await prisma.operador.upsert({
    where: { agentKey: agentKey('vig3robertocosta') },
    update: { agentKeyAt: new Date(), pontos: { connect: { id: ponto3.id } } },
    create: {
      tenantId: tenant1.id,
      nome: 'Roberto Costa', telefone: '+55 11 99345-6789', ativo: true,
      agentKey: agentKey('vig3robertocosta'), agentKeyAt: new Date(),
      pontos: { connect: { id: ponto3.id } },
    },
  })

  // ConfigCiclo padrão do tenant (sem pontoId) — serve de base para novos pontos
  const cicloPadrao = await prisma.configCiclo.findFirst({ where: { tenantId: tenant1.id, pontoId: null } })
  if (!cicloPadrao) {
    await prisma.configCiclo.create({
      data: {
        tenantId: tenant1.id, nome: 'Padrão',
        duracaoMinutos: 30, toleranciaMinutos: 5, avisoAntesMin: 5,
        codigoCheckin: '1602', codigoPanico: '1122', codigoFalha: '1130',
        enviarAvisoWpp: true, autoReiniciar: true, ativo: true,
      },
    })
  }

  // ConfigCiclo + Agendas
  const ciclo1 = await prisma.configCiclo.upsert({
    where: { pontoId: ponto1.id }, update: {},
    create: {
      tenantId: tenant1.id, pontoId: ponto1.id, nome: 'Ciclo Padrão',
      duracaoMinutos: 30, toleranciaMinutos: 5, avisoAntesMin: 5,
      enviarAvisoWpp: true, autoReiniciar: true, ativo: true,
    },
  })
  // Agendas: seg-sex 08:00-18:00 + sáb 08:00-13:00
  await prisma.agendaCiclo.createMany({
    skipDuplicates: true,
    data: [
      { id: 'agenda-c1-semana', configId: ciclo1.id, diasSemana: [1,2,3,4,5], horaInicio: '08:00', horaFim: '18:00', ativo: true },
      { id: 'agenda-c1-sabado', configId: ciclo1.id, diasSemana: [6],         horaInicio: '08:00', horaFim: '13:00', ativo: true },
    ],
  })

  const ciclo2 = await prisma.configCiclo.upsert({
    where: { pontoId: ponto2.id }, update: {},
    create: {
      tenantId: tenant1.id, pontoId: ponto2.id, nome: 'Ciclo Padrão',
      duracaoMinutos: 30, toleranciaMinutos: 5, avisoAntesMin: 5,
      enviarAvisoWpp: true, autoReiniciar: true, ativo: true,
    },
  })
  // Portaria secundária: operação 24h nos dias úteis
  await prisma.agendaCiclo.createMany({
    skipDuplicates: true,
    data: [
      { id: 'agenda-c2-semana', configId: ciclo2.id, diasSemana: [1,2,3,4,5], horaInicio: '00:00', horaFim: '23:59', ativo: true },
    ],
  })

  await prisma.configCiclo.upsert({
    where: { pontoId: ponto3.id }, update: {},
    create: {
      tenantId: tenant1.id, pontoId: ponto3.id, nome: 'Ciclo Estacionamento',
      duracaoMinutos: 45, toleranciaMinutos: 5, avisoAntesMin: 5,
      enviarAvisoWpp: true, autoReiniciar: true, ativo: true,
      // Sem agendas = sem restrição de horário
    },
  })

  // ── Config de Abertura/Fechamento por estabelecimento ──────────────────────
  // Loja 1: seg–sex 08:00–20:00 · Loja 2: seg–sex 08:00–18:00 · Loja 3: todos os dias 08:00–22:00
  const horariosAbertura: { pontoId: string; diasSemana: number[]; horaAbertura: string; horaFechamento: string }[] = [
    { pontoId: ponto1.id, diasSemana: [1, 2, 3, 4, 5], horaAbertura: '08:00', horaFechamento: '20:00' },
    { pontoId: ponto2.id, diasSemana: [1, 2, 3, 4, 5], horaAbertura: '08:00', horaFechamento: '18:00' },
    { pontoId: ponto3.id, diasSemana: [],              horaAbertura: '08:00', horaFechamento: '22:00' }, // vazio = todos os dias
  ]

  for (const h of horariosAbertura) {
    const configAbertura = await prisma.configAbertura.upsert({
      where: { pontoId: h.pontoId },
      update: { ativo: true },
      create: { tenantId: tenant1.id, pontoId: h.pontoId, ativo: true },
    })
    // Substitui os turnos para manter o seed determinístico
    await prisma.turnoAbertura.deleteMany({ where: { configId: configAbertura.id } })
    await prisma.turnoAbertura.create({
      data: {
        configId: configAbertura.id,
        diasSemana: h.diasSemana,
        horaAbertura: h.horaAbertura,
        toleranciaMinutos: 30,
        horaFechamento: h.horaFechamento,
        toleranciaFechamentoMinutos: 15,
        checkinFechamentoObrigatorio: true,
        ativo: true,
      },
    })
  }
  console.log('  ✅ Configs de abertura/fechamento criadas (Loja 1: seg–sex 08–20h · Loja 2: seg–sex 08–18h · Loja 3: todos os dias 08–22h)')

  // Execuções
  await prisma.execucaoCiclo.createMany({
    skipDuplicates: true,
    data: [
      { id: 'exec-1', configId: ciclo1.id, pontoId: ponto1.id, iniciadoEm: horasAtras(6),   expiraEm: horasAtras(5.5), status: CicloStatus.CONCLUIDO, checkinEm: horasAtras(5.6), finalizadoEm: horasAtras(5.5) },
      { id: 'exec-2', configId: ciclo1.id, pontoId: ponto1.id, iniciadoEm: horasAtras(5.5), expiraEm: horasAtras(5),   status: CicloStatus.ALERTA,   alertaEm: horasAtras(5),    finalizadoEm: horasAtras(4.9) },
      { id: 'exec-3', configId: ciclo1.id, pontoId: ponto1.id, iniciadoEm: horasAtras(3),   expiraEm: horasAtras(2.5), status: CicloStatus.CONCLUIDO, checkinEm: horasAtras(2.7), finalizadoEm: horasAtras(2.5) },
      { id: 'exec-4', configId: ciclo2.id, pontoId: ponto2.id, iniciadoEm: horasAtras(4),   expiraEm: horasAtras(3.5), status: CicloStatus.CONCLUIDO, checkinEm: horasAtras(3.6), finalizadoEm: horasAtras(3.5) },
    ],
  })

  // Eventos — incluindo novos tipos
  await prisma.evento.createMany({
    skipDuplicates: true,
    data: [
      { id: 'ev-1',  tenantId: tenant1.id, pontoId: ponto1.id, tipo: TipoEvento.CHECKIN,           canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(6),   meta: { codigoEvento: '1602' } },
      { id: 'ev-2',  tenantId: tenant1.id, pontoId: ponto1.id, tipo: TipoEvento.AVISO,             canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(5.5) },
      { id: 'ev-3',  tenantId: tenant1.id, pontoId: ponto1.id, tipo: TipoEvento.PANICO,            canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(5),   meta: { codigoEvento: '1120' } },
      { id: 'ev-3b', tenantId: tenant1.id, pontoId: ponto1.id, tipo: TipoEvento.PANICO_SILENCIOSO, canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(4.8), meta: { codigoEvento: '1122' } },
      { id: 'ev-3c', tenantId: tenant1.id, pontoId: ponto1.id, tipo: TipoEvento.COACAO,            canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(4.5), meta: { codigoEvento: '1121' } },
      { id: 'ev-4',  tenantId: tenant1.id, pontoId: ponto1.id, tipo: TipoEvento.RESTAURACAO,       canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(4.9) },
      { id: 'ev-5',  tenantId: tenant1.id, pontoId: ponto1.id, tipo: TipoEvento.CHECKIN,           canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(3),   meta: { codigoEvento: '1602' } },
      { id: 'ev-6',  tenantId: tenant1.id, pontoId: ponto2.id, tipo: TipoEvento.CHECKIN,           canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(4),   meta: { codigoEvento: '1602' } },
      { id: 'ev-7',  tenantId: tenant1.id, pontoId: ponto2.id, tipo: TipoEvento.CHECKIN,           canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(1),   meta: { codigoEvento: '1602' } },
      { id: 'ev-8',  tenantId: tenant1.id, pontoId: ponto3.id, tipo: TipoEvento.FALHA,             ocorridoEm: diasAtras(1),    meta: { codigoEvento: '1130' } },
    ],
  })

  await prisma.onboardingStep.upsert({
    where: { tenantId: tenant1.id }, update: {},
    create: {
      tenantId: tenant1.id, ponto: true, operador: true,
      ciclo: true, notificacao: true, teste: true, concluidoEm: diasAtras(5),
    },
  })
  console.log('  ✅ Tenant "Segurança Total Ltda" criado')

  // ── TENANT 2 — Vigilância Nordeste ─────────────────────────────────────────
  const tenant2 = await prisma.tenant.upsert({
    where: { email: 'operacoes@vigilancianordeste.com.br' }, update: {},
    create: {
      id: 'tenant-vigilancia-nordeste', nome: 'Vigilância Nordeste S/A',
      cnpj: '98.765.432/0001-10', email: 'operacoes@vigilancianordeste.com.br',
      telefone: '+55 81 3333-4444', ativo: true, onboardingOk: true,
    },
  })

  await prisma.assinatura.upsert({
    where: { tenantId: tenant2.id }, update: {},
    create: {
      tenantId: tenant2.id, planoId: planoStarter.id,
      periodicidade: Periodicidade.MENSAL, status: AssinaturaStatus.TRIAL,
      pontosContratados: 3,
      trialAteEm: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      externalReference: 'ext-tenant-vigilancia-nordeste',
    },
  })

  const senhaAdmin2 = await bcrypt.hash('Admin@2024!', 12)
  await prisma.usuario.upsert({
    where: { email: 'admin@vigilancianordeste.com.br' },
    update: { senha: senhaAdmin2 },
    create: {
      tenantId: tenant2.id, email: 'admin@vigilancianordeste.com.br',
      nome: 'Fernanda Lima', papel: Papel.ADMIN, senha: senhaAdmin2,
    },
  })

  const ponto4 = await prisma.ponto.upsert({
    where: { id: 'ponto-entrada-industrial' },
    update: { agentKey: agentKey('ponto4entradaindustrial'), agentKeyAt: new Date() },
    create: {
      id: 'ponto-entrada-industrial', tenantId: tenant2.id,
      nome: 'Entrada Industrial', descricao: 'Portaria do parque industrial',
      endereco: 'Rod. BR-101, km 42 – Caruaru/PE', ativo: true,
      canalAlerta: CanalAlerta.WHATSAPP,
      agentKey: agentKey('ponto4entradaindustrial'), agentKeyAt: new Date(),
    },
  })

  await prisma.operador.upsert({
    where: { agentKey: agentKey('vig4pedroferreira') },
    update: { agentKeyAt: new Date(), pontos: { connect: { id: ponto4.id } } },
    create: {
      tenantId: tenant2.id,
      nome: 'Pedro Ferreira', telefone: '+55 81 99876-5432', ativo: true,
      agentKey: agentKey('vig4pedroferreira'), agentKeyAt: new Date(),
      pontos: { connect: { id: ponto4.id } },
    },
  })

  const ciclo4 = await prisma.configCiclo.upsert({
    where: { pontoId: ponto4.id }, update: {},
    create: {
      tenantId: tenant2.id, pontoId: ponto4.id, nome: 'Ciclo Padrão',
      duracaoMinutos: 60, toleranciaMinutos: 10, avisoAntesMin: 10,
      enviarAvisoWpp: true, autoReiniciar: false, ativo: true,
    },
  })
  // Agenda industrial: todos os dias, 06:00-22:00
  await prisma.agendaCiclo.createMany({
    skipDuplicates: true,
    data: [
      { id: 'agenda-c4-diasuteis', configId: ciclo4.id, diasSemana: [1,2,3,4,5], horaInicio: '06:00', horaFim: '22:00', ativo: true },
      { id: 'agenda-c4-fds',       configId: ciclo4.id, diasSemana: [0,6],        horaInicio: '07:00', horaFim: '19:00', ativo: true },
    ],
  })

  await prisma.evento.createMany({
    skipDuplicates: true,
    data: [
      { id: 'ev-9',  tenantId: tenant2.id, pontoId: ponto4.id, tipo: TipoEvento.CHECKIN, canal: CanalAlerta.WHATSAPP, ocorridoEm: horasAtras(2), meta: { codigoEvento: '1602' } },
      { id: 'ev-10', tenantId: tenant2.id, pontoId: ponto4.id, tipo: TipoEvento.TESTE,   ocorridoEm: diasAtras(1) },
    ],
  })

  await prisma.onboardingStep.upsert({
    where: { tenantId: tenant2.id }, update: {},
    create: {
      tenantId: tenant2.id, ponto: true, operador: true,
      ciclo: true, notificacao: false, teste: false,
    },
  })
  console.log('  ✅ Tenant "Vigilância Nordeste S/A" criado')

  // ── TENANT 3 — GuardPro (inadimplente) ────────────────────────────────────
  const tenant3 = await prisma.tenant.upsert({
    where: { email: 'financeiro@guardpro.com.br' }, update: {},
    create: {
      id: 'tenant-guardpro', nome: 'GuardPro Segurança',
      cnpj: '45.678.901/0001-23', email: 'financeiro@guardpro.com.br',
      telefone: '+55 21 2222-3333', ativo: true, onboardingOk: false,
    },
  })

  await prisma.assinatura.upsert({
    where: { tenantId: tenant3.id }, update: {},
    create: {
      tenantId: tenant3.id, planoId: planoPro.id,
      periodicidade: Periodicidade.MENSAL, status: AssinaturaStatus.INADIMPLENTE,
      pontosContratados: 10, proximaCobrancaEm: diasAtras(5),
      externalReference: 'ext-tenant-guardpro',
    },
  })

  const senhaAdmin3 = await bcrypt.hash('Admin@2024!', 12)
  await prisma.usuario.upsert({
    where: { email: 'admin@guardpro.com.br' },
    update: { senha: senhaAdmin3 },
    create: {
      tenantId: tenant3.id, email: 'admin@guardpro.com.br',
      nome: 'Ricardo Batista', papel: Papel.ADMIN, senha: senhaAdmin3,
    },
  })
  console.log('  ✅ Tenant "GuardPro Segurança" criado')

  // ── Gerar agentKey para registros existentes sem chave ────────────────────
  const pontosSemKey = await prisma.ponto.findMany({ where: { agentKey: null } })
  for (const p of pontosSemKey) {
    await prisma.ponto.update({
      where: { id: p.id },
      data: { agentKey: `oc_tst_${randomBytes(6).toString('base64url').toUpperCase()}`, agentKeyAt: new Date() },
    })
  }
  if (pontosSemKey.length) console.log(`  ✅ agentKey gerada para ${pontosSemKey.length} ponto(s) sem chave`)

  const opsSemKey = await prisma.operador.findMany({ where: { agentKey: null } })
  for (const v of opsSemKey) {
    await prisma.operador.update({
      where: { id: v.id },
      data: { agentKey: `oc_tst_${randomBytes(6).toString('base64url').toUpperCase()}`, agentKeyAt: new Date() },
    })
  }
  if (opsSemKey.length) console.log(`  ✅ agentKey gerada para ${opsSemKey.length} operador(es) sem chave`)

  console.log('\n✅ Seed concluído!')
  console.log('\n📋 Credenciais de acesso:')
  console.log(`   Superadmin : ${superadminEmail} / ${superadminSenha}`)
  console.log('   Tenant 1   : admin@segurancatotal.com.br / Admin@2024!')
  console.log('   Tenant 2   : admin@vigilancianordeste.com.br / Admin@2024!')
  console.log('   Tenant 3   : admin@guardpro.com.br / Admin@2024!')
  console.log('\n🔑 agentKeys de teste (Tenant 1):')
  console.log(`   Ponto 1 (Portaria Principal) : ${agentKey('ponto1portariaprincipal')}`)
  console.log(`   Ponto 2 (Portaria Secundária): ${agentKey('ponto2portariasecundaria')}`)
  console.log(`   Vig 1   (João Silva)         : ${agentKey('vig1joaosilva')}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
