import { z } from 'zod';

/** Validación de lo que llega al catálogo de insumos y medicamentos (T303). */

const camposInsumo = {
  nombre: z.string().trim().min(2, 'Ingrese el nombre').max(120),
  tipo: z.enum(['MEDICAMENTO', 'INSUMO'], { error: 'Elija si es medicamento o insumo' }),
  unidadMedida: z
    .string({ error: 'Ingrese la unidad de medida' })
    .trim()
    .min(1, 'Ingrese la unidad de medida')
    .max(30),
  presentacion: z.string().trim().max(120).default(''),
};

export const esquemaAltaInsumo = z.object(camposInsumo);
export const esquemaModificacionInsumo = z
  .object({ ...camposInsumo, presentacion: z.string().trim().max(120), activo: z.boolean() })
  .partial();
export const esquemaFiltrosInsumos = z.object({
  texto: z.string().trim().max(80).optional(),
  tipo: z.enum(['MEDICAMENTO', 'INSUMO']).optional(),
  activo: z.enum(['true', 'false']).default('true'),
});
