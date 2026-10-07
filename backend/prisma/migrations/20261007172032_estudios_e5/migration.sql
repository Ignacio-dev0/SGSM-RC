-- E5 · Estudios en versión mínima (T509–T513 · docs/estudios.md).
-- Generada con `prisma migrate dev --create-only` y completada a mano con los CHECK, que Prisma
-- no expresa (ver docs/modelo-de-datos.md).

-- Observaciones de quien programa y de quien confirma la realización (D32).
-- AlterTable
ALTER TABLE "estudios" ADD COLUMN     "observaciones" VARCHAR(500),
ADD COLUMN     "observaciones_realizacion" VARCHAR(500);

-- T513 · S15: un estudio realizado dice cuándo y quién lo confirmó con su rostro.
ALTER TABLE "estudios" ADD CONSTRAINT "estudios_realizado_completo" CHECK (
  "estado" <> 'REALIZADO' OR ("realizado_en" IS NOT NULL AND "confirmado_por_id" IS NOT NULL)
);

-- T512: un estudio cancelado (a mano o por el egreso, T210) dice por qué.
ALTER TABLE "estudios" ADD CONSTRAINT "estudios_cancelado_con_motivo" CHECK (
  "estado" <> 'CANCELADO' OR "motivo_cancelacion" IS NOT NULL
);
