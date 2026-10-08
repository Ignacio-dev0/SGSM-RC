-- Toma de cada administración, guardada al registrarla (docs/suministros.md · D121). Generada con
-- `prisma migrate dev --create-only` y completada a mano con los datos de las que ya existen.
--
-- Hasta ahora la toma se recalculaba en cada lectura con la agenda vigente: al volver a anclar la
-- agenda (D112), las administraciones viejas cambiaban de toma o quedaban sin ninguna. Guardada,
-- el historial dice siempre para qué toma se dio cada dosis, y TOMA_YA_DADA, la atención del
-- recordatorio y las tomas ya dadas usan ese mismo dato.

-- AlterTable
ALTER TABLE "suministros" ADD COLUMN     "toma_programada" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "suministros_prescripcion_id_toma_programada_idx" ON "suministros"("prescripcion_id", "toma_programada");

-- Las administraciones que ya existen: la toma más cercana de la agenda con la que se dieron, la
-- misma cuenta que hacía la aplicación (agenda.ts · tomaMasCercana). Antes de esta versión la
-- agenda siempre se contaba desde la fecha de inicio; si alguna ya se volvió a anclar, lo dado
-- después del ancla se cuenta desde el ancla. En la agenda original, la primera toma se pudo
-- adelantar hasta media frecuencia (RN07); antes de eso no hay toma. Los movimientos de
-- insumos quedan sin toma.
WITH agenda AS (
  SELECT s.id, s.fecha_hora, p.fecha_inicio, p.fecha_fin, p.frecuencia_horas * 3600 AS f,
         CASE WHEN s.fecha_hora >= p.agenda_desde THEN p.agenda_desde ELSE p.fecha_inicio END
           AS ancla
  FROM "suministros" s
  JOIN "prescripciones" p ON p.id = s.prescripcion_id
  WHERE s.tipo = 'MEDICAMENTO'
), toma AS (
  SELECT id, ancla, f,
         GREATEST(0, CASE
           WHEN fecha_fin IS NULL THEN round(extract(epoch FROM fecha_hora - ancla) / f)
           ELSE LEAST(round(extract(epoch FROM fecha_hora - ancla) / f),
                      floor(extract(epoch FROM fecha_fin - ancla) / f))
         END) AS k,
         ancla = fecha_inicio
           AND fecha_hora < ancla - make_interval(secs => (f / 2.0)::double precision)
           AS antes_del_inicio
  FROM agenda
)
UPDATE "suministros" s
SET "toma_programada" = t.ancla + make_interval(secs => (t.k * t.f)::double precision)
FROM toma t
WHERE s.id = t.id AND NOT t.antes_del_inicio;
