-- AlterEnum
BEGIN;
CREATE TYPE "AgentKeyTipo_new" AS ENUM ('PONTO', 'OPERADOR');
ALTER TABLE "AgentKeyLog" ALTER COLUMN "tipo" TYPE "AgentKeyTipo_new" USING ("tipo"::text::"AgentKeyTipo_new");
ALTER TYPE "AgentKeyTipo" RENAME TO "AgentKeyTipo_old";
ALTER TYPE "AgentKeyTipo_new" RENAME TO "AgentKeyTipo";
DROP TYPE "AgentKeyTipo_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Papel_new" AS ENUM ('SUPERADMIN', 'ADMIN', 'OPERADOR');
ALTER TABLE "Usuario" ALTER COLUMN "papel" DROP DEFAULT;
ALTER TABLE "Usuario" ALTER COLUMN "papel" TYPE "Papel_new" USING ("papel"::text::"Papel_new");
ALTER TYPE "Papel" RENAME TO "Papel_old";
ALTER TYPE "Papel_new" RENAME TO "Papel";
DROP TYPE "Papel_old";
ALTER TABLE "Usuario" ALTER COLUMN "papel" SET DEFAULT 'OPERADOR';
COMMIT;

-- DropForeignKey
ALTER TABLE "Vigilante" DROP CONSTRAINT "Vigilante_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "_VigilantePontos" DROP CONSTRAINT "_VigilantePontos_A_fkey";

-- DropForeignKey
ALTER TABLE "_VigilantePontos" DROP CONSTRAINT "_VigilantePontos_B_fkey";

-- AlterTable
ALTER TABLE "OnboardingStep" DROP COLUMN "vigilante",
ADD COLUMN     "operador" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "Vigilante";

-- DropTable
DROP TABLE "_VigilantePontos";

-- CreateTable
CREATE TABLE "Operador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "rfid" TEXT,
    "codigo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentKey" TEXT,
    "agentKeyAt" TIMESTAMP(3),

    CONSTRAINT "Operador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OperadorPontos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Operador_agentKey_key" ON "Operador"("agentKey");

-- CreateIndex
CREATE UNIQUE INDEX "Operador_tenantId_codigo_key" ON "Operador"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "_OperadorPontos_AB_unique" ON "_OperadorPontos"("A", "B");

-- CreateIndex
CREATE INDEX "_OperadorPontos_B_index" ON "_OperadorPontos"("B");

-- AddForeignKey
ALTER TABLE "Operador" ADD CONSTRAINT "Operador_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OperadorPontos" ADD CONSTRAINT "_OperadorPontos_A_fkey" FOREIGN KEY ("A") REFERENCES "Operador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OperadorPontos" ADD CONSTRAINT "_OperadorPontos_B_fkey" FOREIGN KEY ("B") REFERENCES "Ponto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
