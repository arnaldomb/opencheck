-- Migration: ConfigAbertura agora usa TurnoAbertura (múltiplos horários por dia da semana)

-- 1. Criar tabela TurnoAbertura
CREATE TABLE "TurnoAbertura" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "diasSemana" INTEGER[],
    "horaAbertura" TEXT NOT NULL,
    "toleranciaMinutos" INTEGER NOT NULL DEFAULT 30,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TurnoAbertura_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TurnoAbertura" ADD CONSTRAINT "TurnoAbertura_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "ConfigAbertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Migrar dados existentes → criar um TurnoAbertura por ConfigAbertura
INSERT INTO "TurnoAbertura" ("id", "configId", "diasSemana", "horaAbertura", "toleranciaMinutos", "ativo", "criadoEm")
SELECT
    'turno_migrated_' || "id",
    "id",
    "diasSemana",
    "horaAbertura",
    "toleranciaMinutos",
    true,
    CURRENT_TIMESTAMP
FROM "ConfigAbertura";

-- 3. Adicionar turnoId em RegistroAbertura
ALTER TABLE "RegistroAbertura" ADD COLUMN "turnoId" TEXT;

ALTER TABLE "RegistroAbertura" ADD CONSTRAINT "RegistroAbertura_turnoId_fkey"
    FOREIGN KEY ("turnoId") REFERENCES "TurnoAbertura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Remover colunas antigas de ConfigAbertura
ALTER TABLE "ConfigAbertura" DROP COLUMN "horaAbertura";
ALTER TABLE "ConfigAbertura" DROP COLUMN "toleranciaMinutos";
ALTER TABLE "ConfigAbertura" DROP COLUMN "diasSemana";

-- 5. Adicionar valor ABERTURA_CHECKIN ao enum TipoEvento
ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'ABERTURA_CHECKIN';
