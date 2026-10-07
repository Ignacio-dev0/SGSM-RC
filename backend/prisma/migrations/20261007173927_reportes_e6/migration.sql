-- E6 · Reportes, estadísticas y auditoría (T601–T604 · docs/reportes.md).
-- Generada con `prisma migrate dev --create-only`.

-- Los reportes de todo el hospital filtran por período: sin este índice recorren la tabla (los
-- que hay empiezan por paciente o por usuario).
-- CreateIndex
CREATE INDEX "suministros_fecha_hora_idx" ON "suministros"("fecha_hora");
