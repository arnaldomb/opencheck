-- AlterTable: RegistroAbertura — adicionar supervisorId e fechamentoSupervisorId
ALTER TABLE "RegistroAbertura" ADD COLUMN "supervisorId" TEXT;
ALTER TABLE "RegistroAbertura" ADD COLUMN "fechamentoSupervisorId" TEXT;

-- AddForeignKey
ALTER TABLE "RegistroAbertura" ADD CONSTRAINT "RegistroAbertura_supervisorId_fkey"
  FOREIGN KEY ("supervisorId") REFERENCES "Supervisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RegistroAbertura" ADD CONSTRAINT "RegistroAbertura_fechamentoSupervisorId_fkey"
  FOREIGN KEY ("fechamentoSupervisorId") REFERENCES "Supervisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
