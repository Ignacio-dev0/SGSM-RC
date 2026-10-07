import { z } from 'zod';

/**
 * Esquemas de la API de recordatorios (E5 · T506 · T507). Solo dependen de zod: el frontend los
 * importa como contrato (frontend/src/pruebas/contrato.ts). Ver docs/recordatorios.md.
 */

export const TIPOS_RECORDATORIO = ['MEDICAMENTO', 'ESTUDIO'] as const;

/** GET /api/recordatorios?tipo&salaId — sin filtros, todos los del hospital (S13). */
export const esquemaBusquedaRecordatorios = z.object({
  tipo: z.enum(TIPOS_RECORDATORIO, { error: 'El tipo es MEDICAMENTO o ESTUDIO' }).optional(),
  /** Sala de la cama actual del paciente. */
  salaId: z.coerce.number({ error: 'Elija una sala' }).int().positive('Elija una sala').optional(),
});

/** POST /api/recordatorios/:id/no-administrar — "No se administró" con su motivo (S12). */
export const esquemaNoAdministrado = z.object({
  motivo: z
    .string({ error: 'Indique por qué no se administró' })
    .trim()
    .min(3, 'Indique por qué no se administró')
    .max(255, 'El motivo puede tener hasta 255 caracteres'),
});

export type BusquedaRecordatorios = z.infer<typeof esquemaBusquedaRecordatorios>;
export type NoAdministrado = z.infer<typeof esquemaNoAdministrado>;
