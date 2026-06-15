-- Add missing event type for opening deadline failures
ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'ABERTURA_AUSENTE';
