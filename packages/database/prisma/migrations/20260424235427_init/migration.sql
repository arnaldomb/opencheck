-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('SUPERADMIN', 'ADMIN', 'OPERADOR', 'VIGILANTE');

-- CreateEnum
CREATE TYPE "Periodicidade" AS ENUM ('MENSAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "AssinaturaStatus" AS ENUM ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'SUSPENSA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CobrancaStatus" AS ENUM ('PENDENTE', 'CONFIRMADA', 'RECEBIDA', 'VENCIDA', 'CANCELADA', 'ESTORNADA');

-- CreateEnum
CREATE TYPE "CicloStatus" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDO', 'ALERTA', 'FALHA');

-- CreateEnum
CREATE TYPE "CanalAlerta" AS ENUM ('WHATSAPP', 'CTRLSAFE');

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('WHATSAPP', 'CTRLSAFE');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('CHECKIN', 'PANICO', 'FALHA', 'AVISO', 'RESTAURACAO', 'TESTE');

-- CreateTable
CREATE TABLE "Superadmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Superadmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plano" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "pontosIncluidos" INTEGER NOT NULL,
    "valorMensal" DECIMAL(10,2) NOT NULL,
    "valorAnual" DECIMAL(10,2),
    "limiteCameras" INTEGER NOT NULL DEFAULT 5,
    "limiteUsuarios" INTEGER NOT NULL DEFAULT 10,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "onboardingOk" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ezvizAppKey" TEXT,
    "ezvizAppSecret" TEXT,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'OPERADOR',
    "senha" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assinatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "periodicidade" "Periodicidade" NOT NULL DEFAULT 'MENSAL',
    "status" "AssinaturaStatus" NOT NULL DEFAULT 'TRIAL',
    "asaasCustomerId" TEXT,
    "asaasSubscriptionId" TEXT,
    "externalReference" TEXT NOT NULL,
    "pontosContratados" INTEGER NOT NULL,
    "proximaCobrancaEm" TIMESTAMP(3),
    "trialAteEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobranca" (
    "id" TEXT NOT NULL,
    "assinaturaId" TEXT NOT NULL,
    "asaasPaymentId" TEXT NOT NULL,
    "asaasEventId" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "CobrancaStatus" NOT NULL,
    "billingType" TEXT NOT NULL,
    "vencimentoEm" TIMESTAMP(3) NOT NULL,
    "paguEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ponto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canalAlerta" "CanalAlerta",
    "ctrlsafeAccount" TEXT,
    "ctrlsafePartition" TEXT,
    "ctrlsafeZone" TEXT,
    "ctrlsafeReceiver" TEXT,
    "ctrlsafeLine" TEXT,

    CONSTRAINT "Ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vigilante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pontoId" TEXT,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "rfid" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vigilante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pontoId" TEXT,
    "deviceSerial" TEXT NOT NULL,
    "deviceName" TEXT,
    "channelNo" INTEGER NOT NULL DEFAULT 1,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ezvizAppKey" TEXT,
    "ezvizAppSecret" TEXT,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "eventoId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigCiclo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pontoId" TEXT,
    "nome" TEXT NOT NULL DEFAULT 'Padrão',
    "duracaoMinutos" INTEGER NOT NULL DEFAULT 10,
    "toleranciaMinutos" INTEGER NOT NULL DEFAULT 2,
    "avisoAntesMin" INTEGER NOT NULL DEFAULT 5,
    "codigoCheckin" TEXT NOT NULL DEFAULT '1602',
    "codigoPanico" TEXT NOT NULL DEFAULT '1122',
    "codigoFalha" TEXT NOT NULL DEFAULT '1130',
    "capturarSnapshot" BOOLEAN NOT NULL DEFAULT true,
    "enviarAvisoWpp" BOOLEAN NOT NULL DEFAULT true,
    "autoReiniciar" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigCiclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecucaoCiclo" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "pontoId" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "finalizadoEm" TIMESTAMP(3),
    "status" "CicloStatus" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "checkinEm" TIMESTAMP(3),
    "alertaEm" TIMESTAMP(3),
    "snapshotId" TEXT,
    "avisoJobId" TEXT,
    "expiraJobId" TEXT,

    CONSTRAINT "ExecucaoCiclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pontoId" TEXT,
    "tipo" "TipoEvento" NOT NULL,
    "canal" "CanalAlerta",
    "encaminhado" BOOLEAN NOT NULL DEFAULT false,
    "snapshotId" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigNotificacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "evolutionUrl" TEXT,
    "evolutionApiKey" TEXT,
    "evolutionInstance" TEXT,
    "whatsappDestino" TEXT,
    "ctrlsafeAgentToken" TEXT,
    "ctrlsafeInstallId" TEXT,

    CONSTRAINT "ConfigNotificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ponto" BOOLEAN NOT NULL DEFAULT false,
    "vigilante" BOOLEAN NOT NULL DEFAULT false,
    "ciclo" BOOLEAN NOT NULL DEFAULT false,
    "notificacao" BOOLEAN NOT NULL DEFAULT false,
    "teste" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "OnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Superadmin_email_key" ON "Superadmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_cnpj_key" ON "Tenant"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_tenantId_key" ON "Assinatura"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_asaasCustomerId_key" ON "Assinatura"("asaasCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_asaasSubscriptionId_key" ON "Assinatura"("asaasSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_externalReference_key" ON "Assinatura"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "Cobranca_asaasPaymentId_key" ON "Cobranca"("asaasPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Cobranca_asaasEventId_key" ON "Cobranca"("asaasEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigCiclo_pontoId_key" ON "ConfigCiclo"("pontoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfigNotificacao_tenantId_tipo_key" ON "ConfigNotificacao"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingStep_tenantId_key" ON "OnboardingStep"("tenantId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "Assinatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ponto" ADD CONSTRAINT "Ponto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vigilante" ADD CONSTRAINT "Vigilante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vigilante" ADD CONSTRAINT "Vigilante_pontoId_fkey" FOREIGN KEY ("pontoId") REFERENCES "Ponto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_pontoId_fkey" FOREIGN KEY ("pontoId") REFERENCES "Ponto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigCiclo" ADD CONSTRAINT "ConfigCiclo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigCiclo" ADD CONSTRAINT "ConfigCiclo_pontoId_fkey" FOREIGN KEY ("pontoId") REFERENCES "Ponto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoCiclo" ADD CONSTRAINT "ExecucaoCiclo_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ConfigCiclo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoCiclo" ADD CONSTRAINT "ExecucaoCiclo_pontoId_fkey" FOREIGN KEY ("pontoId") REFERENCES "Ponto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_pontoId_fkey" FOREIGN KEY ("pontoId") REFERENCES "Ponto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigNotificacao" ADD CONSTRAINT "ConfigNotificacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
