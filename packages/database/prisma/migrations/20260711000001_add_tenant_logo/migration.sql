-- Logo do cliente (data URI base64) para personalizar painel e relatórios
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
