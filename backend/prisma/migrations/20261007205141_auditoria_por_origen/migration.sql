-- Filtro de origen de la auditoría (personas o sistema, docs/reportes.md · D101).
-- Generada con `prisma migrate dev --create-only` y revisada: solo cambia un índice.

-- El índice del orden de la consulta (D72) suma usuario_id: con origen=personas (el filtro por
-- defecto de la pantalla) o sistema, los ids de una página lejana salen del índice solo, sin leer
-- la tabla. Reemplaza al de (fecha_hora, id) con el mismo tamaño. Primero se crea el nuevo.
-- CreateIndex
CREATE INDEX "auditoria_fecha_hora_id_usuario_id_idx" ON "auditoria"("fecha_hora", "id", "usuario_id");

-- DropIndex
DROP INDEX "auditoria_fecha_hora_id_idx";
