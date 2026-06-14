-- CreateEnum
CREATE TYPE "StatusAbertura" AS ENUM ('NO_PRAZO', 'ATRASADO', 'AUSENTE');

-- CreateTable
CREATE TABLE "ConfigAbertura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pontoId" TEXT NOT NULL,
    "horaAbertura" TEXT NOT NULL,
    "toleranciaMinutos" INTEGER NOT NULL DEFAULT 30,
    "diasSemana" INTEGER[],
    "emailAlerta" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigAbertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAbertura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pontoId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "status" "StatusAbertura" NOT NULL DEFAULT 'AUSENTE',
    "deadlineEm" TIMESTAMP(3) NOT NULL,
    "abertaEm" TIMESTAMP(3),
    "operadorId" TEXT,
    "nomeComputador" TEXT,
    "usuarioWindows" TEXT,
    "jobId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroAbertura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfigAbertura_pontoId_key" ON "ConfigAbertura"("pontoId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroAbertura_pontoId_data_key" ON "RegistroAbertura"("pontoId", "data");

-- AddForeignKey
ALTER TABLE "ConfigAbertura" ADD CONSTRAINT "ConfigAbertura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigAbertura" ADD CONSTRAINT "ConfigAbertura_pontoId_fkey" FOREIGN KEY ("pontoId") REFERENCES "Ponto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAbertura" ADD CONSTRAINT "RegistroAbertura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAbertura" ADD CONSTRAINT "RegistroAbertura_pontoId_fkey" FOREIGN KEY ("pontoId") REFERENCES "Ponto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAbertura" ADD CONSTRAINT "RegistroAbertura_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ConfigAbertura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAbertura" ADD CONSTRAINT "RegistroAbertura_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "Operador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
