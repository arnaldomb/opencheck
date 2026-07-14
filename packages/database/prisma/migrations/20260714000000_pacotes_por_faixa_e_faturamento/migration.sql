-- AlterTable
ALTER TABLE "Assinatura" ADD COLUMN     "cnpjFaturamento" TEXT,
ADD COLUMN     "diaVencimento" INTEGER,
ADD COLUMN     "emailFaturamento" TEXT,
ADD COLUMN     "razaoSocialFaturamento" TEXT;

-- AlterTable
-- Plano passa a representar faixas de preço por quantidade de contas
-- (faixaMin/faixaMax/precoConta) em vez de um pacote fixo.
ALTER TABLE "Plano" DROP COLUMN "limiteUsuarios",
DROP COLUMN "pontosIncluidos",
DROP COLUMN "valorAnual",
DROP COLUMN "valorMensal",
ADD COLUMN     "faixaMax" INTEGER,
ADD COLUMN     "faixaMin" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "precoConta" DECIMAL(10,2);

ALTER TABLE "Plano" ALTER COLUMN "faixaMin" DROP DEFAULT;
