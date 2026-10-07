-- T702 · Pruebas de rendimiento con volumen de un año (docs/rendimiento.md, D70–D76).
-- Generada con `prisma migrate dev --create-only` y revisada: solo índices, sin tocar los índices
-- parciales ni los CHECK de las migraciones anteriores.

-- La consulta de auditoría ordena por fecha y id: con los dos en el índice, una página lejana se
-- resuelve recorriendo solo el índice (D72). Reemplaza al de fecha_hora sola.
-- DropIndex
DROP INDEX "auditoria_fecha_hora_idx";

-- CreateIndex
CREATE INDEX "auditoria_fecha_hora_id_idx" ON "auditoria"("fecha_hora", "id");

-- Filtro por acción en el mismo orden y las acciones distintas para los filtros (D73).
-- CreateIndex
CREATE INDEX "auditoria_accion_fecha_hora_id_idx" ON "auditoria"("accion", "fecha_hora", "id");

-- Los detalles de cada suministro: sin índice, cada lista con detalles recorría la tabla (D71).
-- CreateIndex
CREATE INDEX "detalles_suministro_suministro_id_idx" ON "detalles_suministro"("suministro_id");

-- Últimas administraciones de cada prescripción (ficha) y tomas ya dadas del ciclo (D71).
-- CreateIndex
CREATE INDEX "suministros_prescripcion_id_fecha_hora_idx" ON "suministros"("prescripcion_id", "fecha_hora");
