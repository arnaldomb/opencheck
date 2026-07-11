-- Remoção total da integração de câmeras (EZVIZ)
DROP TABLE IF EXISTS "Snapshot";
DROP TABLE IF EXISTS "Camera";

ALTER TABLE "Plano"         DROP COLUMN IF EXISTS "limiteCameras";
ALTER TABLE "Tenant"        DROP COLUMN IF EXISTS "camerasHabilitadas";
ALTER TABLE "ConfigCiclo"   DROP COLUMN IF EXISTS "capturarSnapshot";
ALTER TABLE "ExecucaoCiclo" DROP COLUMN IF EXISTS "snapshotId";
ALTER TABLE "Evento"        DROP COLUMN IF EXISTS "snapshotId";
