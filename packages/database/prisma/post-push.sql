-- Garante que os valores de enum adicionados após o schema inicial existam.
-- ALTER TYPE ADD VALUE falha dentro de transação no PG < 16, por isso
-- rodamos fora do prisma db push com IF NOT EXISTS para ser idempotente.
ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'ABERTURA_CHECKIN';
ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'ABERTURA_AUSENTE';
