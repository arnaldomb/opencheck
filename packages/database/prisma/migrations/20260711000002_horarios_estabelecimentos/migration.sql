-- Horários de abertura/fechamento por estabelecimento (dados)
-- Loja 1: seg–sex 08:00–20:00 · Loja 2: seg–sex 08:00–18:00 · Loja 3: todos os dias 08:00–22:00
-- Idempotente: só insere se o ponto existir e ainda não tiver config/turno.

INSERT INTO "ConfigAbertura" (id, "tenantId", "pontoId", ativo, "atualizadoEm")
SELECT 'cfg-abertura-loja1', p."tenantId", p.id, true, now()
FROM "Ponto" p WHERE p.id = 'ponto-portaria-principal'
ON CONFLICT ("pontoId") DO NOTHING;

INSERT INTO "ConfigAbertura" (id, "tenantId", "pontoId", ativo, "atualizadoEm")
SELECT 'cfg-abertura-loja2', p."tenantId", p.id, true, now()
FROM "Ponto" p WHERE p.id = 'ponto-portaria-secundaria'
ON CONFLICT ("pontoId") DO NOTHING;

INSERT INTO "ConfigAbertura" (id, "tenantId", "pontoId", ativo, "atualizadoEm")
SELECT 'cfg-abertura-loja3', p."tenantId", p.id, true, now()
FROM "Ponto" p WHERE p.id = 'ponto-guarita-estacionamento'
ON CONFLICT ("pontoId") DO NOTHING;

-- Turnos (diasSemana vazio = todos os dias)
INSERT INTO "TurnoAbertura" (id, "configId", "diasSemana", "horaAbertura", "toleranciaMinutos", "horaFechamento", "toleranciaFechamentoMinutos", "checkinFechamentoObrigatorio", ativo)
SELECT 'turno-loja1-padrao', c.id, ARRAY[1,2,3,4,5], '08:00', 30, '20:00', 15, true, true
FROM "ConfigAbertura" c
WHERE c."pontoId" = 'ponto-portaria-principal'
  AND NOT EXISTS (SELECT 1 FROM "TurnoAbertura" t WHERE t."configId" = c.id);

INSERT INTO "TurnoAbertura" (id, "configId", "diasSemana", "horaAbertura", "toleranciaMinutos", "horaFechamento", "toleranciaFechamentoMinutos", "checkinFechamentoObrigatorio", ativo)
SELECT 'turno-loja2-padrao', c.id, ARRAY[1,2,3,4,5], '08:00', 30, '18:00', 15, true, true
FROM "ConfigAbertura" c
WHERE c."pontoId" = 'ponto-portaria-secundaria'
  AND NOT EXISTS (SELECT 1 FROM "TurnoAbertura" t WHERE t."configId" = c.id);

INSERT INTO "TurnoAbertura" (id, "configId", "diasSemana", "horaAbertura", "toleranciaMinutos", "horaFechamento", "toleranciaFechamentoMinutos", "checkinFechamentoObrigatorio", ativo)
SELECT 'turno-loja3-padrao', c.id, ARRAY[]::integer[], '08:00', 30, '22:00', 15, true, true
FROM "ConfigAbertura" c
WHERE c."pontoId" = 'ponto-guarita-estacionamento'
  AND NOT EXISTS (SELECT 1 FROM "TurnoAbertura" t WHERE t."configId" = c.id);
