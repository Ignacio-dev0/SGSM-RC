-- Insumos en uso (docs/suministros.md · D116). Generada con `prisma migrate dev --create-only` y
-- revisada: solo agrega índices.
--
-- El catálogo dice si cada insumo o medicamento ya lo usa alguna prescripción o algún suministro
-- (y entonces no deja cambiarle el tipo ni la unidad). La pregunta es de existencia: con estos
-- índices se responde con una búsqueda por insumo, sin recorrer los detalles de un año.

-- CreateIndex
CREATE INDEX "detalles_suministro_insumo_id_idx" ON "detalles_suministro"("insumo_id");

-- CreateIndex
CREATE INDEX "prescripciones_insumo_id_idx" ON "prescripciones"("insumo_id");
