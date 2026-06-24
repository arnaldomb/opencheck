-- CreateEnum
CREATE TYPE "TipoRegistroSupervisor" AS ENUM ('ENTRADA', 'SAIDA');

-- AlterEnum: TipoEvento — adicionar SUPERVISOR_ENTRADA e SUPERVISOR_SAIDA
ALTER TYPE "TipoEvento" ADD VALUE 'SUPERVISOR_ENTRADA';
ALTER TYPE "TipoEvento" ADD VALUE 'SUPERVISOR_SAIDA';

-- AlterEnum: AgentKeyTipo — adicionar SUPERVISOR
ALTER TYPE "AgentKeyTipo" ADD VALUE 'SUPERVISOR';

-- CreateTable: Supervisor
CREATE TABLE "Supervisor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "codigo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentKey" TEXT,
    "agentKeyAt" TIMESTAMP(3),

    CONSTRAINT "Supervisor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RegistroSupervisor
CREATE TABLE "RegistroSupervisor" (
    "id" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "pontoId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoRegistroSupervisor" NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "RegistroSupervisor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: _SupervisorPontos (many-to-many)
CREATE TABLE "_SupervisorPontos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Supervisor_agentKey_key" ON "Supervisor"("agentKey");
CREATE UNIQUE INDEX "Supervisor_tenantId_codigo_key" ON "Supervisor"("tenantId", "codigo");
CREATE UNIQUE INDEX "_SupervisorPontos_AB_unique" ON "_SupervisorPontos"("A", "B");
CREATE INDEX "_SupervisorPontos_B_index" ON "_SupervisorPontos"("B");

-- AddForeignKey
ALTER TABLE "Supervisor" ADD CONSTRAINT "Supervisor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistroSupervisor" ADD CONSTRAINT "RegistroSupervisor_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroSupervisor" ADD CONSTRAINT "RegistroSupervisor_pontoId_fkey" FOREIGN KEY ("pontoId") REFERENCES "Ponto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistroSupervisor" ADD CONSTRAINT "RegistroSupervisor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "_SupervisorPontos" ADD CONSTRAINT "_SupervisorPontos_A_fkey" FOREIGN KEY ("A") REFERENCES "Ponto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_SupervisorPontos" ADD CONSTRAINT "_SupervisorPontos_B_fkey" FOREIGN KEY ("B") REFERENCES "Supervisor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
