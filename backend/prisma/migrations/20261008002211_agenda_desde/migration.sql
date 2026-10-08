-- Ancla de la agenda de cada prescripción (docs/modelo-de-datos.md · D112 de docs/recordatorios.md).
-- Generada con `prisma migrate dev --create-only` y completada a mano: la columna es obligatoria y
-- las prescripciones que ya existen tienen que quedar con su agenda de siempre.
--
-- Las tomas se cuentan desde `agenda_desde` (la toma 0). Es la fecha de inicio hasta que la
-- prescripción se reanuda o cambia de frecuencia: entonces pasa a ese momento (o a la última dosis
-- dada) y las tomas nuevas se cuentan desde ahí, con la frecuencia vigente.

-- AlterTable
ALTER TABLE "prescripciones" ADD COLUMN "agenda_desde" TIMESTAMPTZ(3);

-- Las que ya existen siguen con la agenda desde su inicio, como hasta ahora.
UPDATE "prescripciones" SET "agenda_desde" = "fecha_inicio";

ALTER TABLE "prescripciones" ALTER COLUMN "agenda_desde" SET NOT NULL;
