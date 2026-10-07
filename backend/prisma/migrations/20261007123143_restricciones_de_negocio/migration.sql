-- T102 · Restricciones de negocio que Prisma no puede expresar en el esquema.
-- Ver docs/modelo-de-datos.md.

-- RN02: una cama tiene un solo paciente activo (la asignación activa no tiene fecha_hasta).
CREATE UNIQUE INDEX "asignaciones_cama_cama_activa_key"
  ON "asignaciones_cama" ("cama_id") WHERE "fecha_hasta" IS NULL;

-- RN02: un paciente ocupa una sola cama a la vez.
CREATE UNIQUE INDEX "asignaciones_cama_paciente_activo_key"
  ON "asignaciones_cama" ("paciente_id") WHERE "fecha_hasta" IS NULL;

-- Un egreso siempre tiene fecha y motivo; un internado no los tiene.
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_egreso_completo" CHECK (
  ("estado" = 'INTERNADO' AND "fecha_egreso" IS NULL)
  OR ("estado" = 'EGRESADO' AND "fecha_egreso" IS NOT NULL AND "motivo_egreso" IS NOT NULL)
);

-- Prescripciones: dosis positiva y frecuencia entre 1 hora y 1 semana.
ALTER TABLE "prescripciones" ADD CONSTRAINT "prescripciones_dosis_positiva" CHECK ("dosis" > 0);
ALTER TABLE "prescripciones" ADD CONSTRAINT "prescripciones_frecuencia_valida"
  CHECK ("frecuencia_horas" BETWEEN 1 AND 168);
ALTER TABLE "prescripciones" ADD CONSTRAINT "prescripciones_fin_posterior_inicio"
  CHECK ("fecha_fin" IS NULL OR "fecha_fin" > "fecha_inicio");

-- Suministros: cantidades positivas.
ALTER TABLE "detalles_suministro" ADD CONSTRAINT "detalles_suministro_cantidad_positiva"
  CHECK ("cantidad" > 0);

-- Biometría: el patrón facial de face-api tiene exactamente 128 valores.
ALTER TABLE "datos_biometricos" ADD CONSTRAINT "datos_biometricos_patron_128"
  CHECK (cardinality("patron") = 128);
