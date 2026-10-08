-- E5 · Recordatorios de medicamentos y estudios (docs/diseno-e5.md · D13).
-- Generada con `prisma migrate dev --create-only` y completada a mano: Prisma no expresa los
-- índices únicos parciales ni los CHECK (ver docs/modelo-de-datos.md).

-- Los índices únicos totales impedían volver a recordar una toma cancelada al reanudar o
-- modificar la prescripción: se reemplazan por índices simples y por los únicos parciales de abajo.
-- DropIndex
DROP INDEX "recordatorios_estudio_id_fecha_hora_objetivo_key";

-- DropIndex
DROP INDEX "recordatorios_prescripcion_id_fecha_hora_objetivo_key";

-- AlterTable
ALTER TABLE "recordatorios" ADD COLUMN     "motivo_no_administrado" VARCHAR(255),
ADD COLUMN     "vencido_en" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "recordatorios_prescripcion_id_fecha_hora_objetivo_idx" ON "recordatorios"("prescripcion_id", "fecha_hora_objetivo");

-- CreateIndex
CREATE INDEX "recordatorios_estudio_id_fecha_hora_objetivo_idx" ON "recordatorios"("estudio_id", "fecha_hora_objetivo");

-- T502: una toma (o un estudio en un horario) tiene un solo recordatorio que no esté cancelado.
-- El temporizador genera con ON CONFLICT DO NOTHING (skipDuplicates) apoyado en estos índices.
CREATE UNIQUE INDEX "recordatorios_toma_activa_key"
  ON "recordatorios" ("prescripcion_id", "fecha_hora_objetivo") WHERE "estado" <> 'CANCELADO';
CREATE UNIQUE INDEX "recordatorios_estudio_activo_key"
  ON "recordatorios" ("estudio_id", "fecha_hora_objetivo") WHERE "estado" <> 'CANCELADO';

-- Una toma recuerda una prescripción; un estudio, un estudio. Nunca los dos ni ninguno.
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_origen_segun_tipo" CHECK (
  ("tipo" = 'MEDICAMENTO' AND "prescripcion_id" IS NOT NULL AND "estudio_id" IS NULL)
  OR ("tipo" = 'ESTUDIO' AND "estudio_id" IS NOT NULL AND "prescripcion_id" IS NULL)
);

-- S12: atendido = cuándo y cómo. Una toma, con la administración que la atendió o con el motivo
-- por el que no se dio (una sola de las dos); un estudio, con su confirmación (en `estudios`).
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_atendido_completo" CHECK (
  "estado" <> 'ATENDIDO'
  OR (
    "atendido_en" IS NOT NULL
    AND (
      ("tipo" = 'MEDICAMENTO' AND num_nonnulls("suministro_id", "motivo_no_administrado") = 1)
      OR ("tipo" = 'ESTUDIO' AND num_nonnulls("suministro_id", "motivo_no_administrado") = 0)
    )
  )
);

-- S11: un vencido guarda cuándo venció (y lo conserva si después se atiende tarde).
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_vencido_con_fecha" CHECK (
  "estado" <> 'VENCIDO' OR "vencido_en" IS NOT NULL
);
