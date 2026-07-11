-- Integração WhatsApp migrada da Evolution API para Z-API
ALTER TABLE "ConfigNotificacao" ADD COLUMN IF NOT EXISTS "zapiInstanceId"  TEXT;
ALTER TABLE "ConfigNotificacao" ADD COLUMN IF NOT EXISTS "zapiToken"       TEXT;
ALTER TABLE "ConfigNotificacao" ADD COLUMN IF NOT EXISTS "zapiClientToken" TEXT;

ALTER TABLE "ConfigNotificacao" DROP COLUMN IF EXISTS "evolutionUrl";
ALTER TABLE "ConfigNotificacao" DROP COLUMN IF EXISTS "evolutionApiKey";
ALTER TABLE "ConfigNotificacao" DROP COLUMN IF EXISTS "evolutionInstance";
ALTER TABLE "ConfigNotificacao" DROP COLUMN IF EXISTS "evolutionInstanceToken";
