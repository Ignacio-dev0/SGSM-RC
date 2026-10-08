import { z } from 'zod';

/**
 * Esquemas de la API de estudios (E5 · T509–T513). Solo dependen de zod: el frontend los importa
 * como contrato (frontend/src/pruebas/contrato.ts). Que la fecha sea razonable (no en el pasado,
 * no demasiado lejos) lo decide el servidor con su reloj (D26). Ver docs/estudios.md.
 */

export const ESTADOS_ESTUDIO = ['PROGRAMADO', 'REALIZADO', 'CANCELADO'] as const;

const fechaHora = z.iso.datetime({ offset: true, error: 'Indique la fecha y hora del estudio' });

/** Texto opcional: vacío o null quedan en null. */
const textoOpcional = (max: number, mensaje: string) =>
  z
    .string()
    .trim()
    .max(max, mensaje)
    .nullish()
    .transform((v) => (v ? v : null));

const observaciones = textoOpcional(500, 'Las observaciones pueden tener hasta 500 caracteres');

/** POST /api/pacientes/:id/estudios — el médico programa un estudio (T511 · S15). */
export const esquemaProgramarEstudio = z.object({
  tipoEstudioId: z
    .number({ error: 'Elija el tipo de estudio' })
    .int()
    .positive('Elija el tipo de estudio'),
  fechaHora,
  /** Si se omite, el nombre del tipo; sirve para precisar ("Rx de tórax frente y perfil"). */
  nombre: z
    .string()
    .trim()
    .max(120, 'El nombre puede tener hasta 120 caracteres')
    .nullish()
    .transform((v) => (v ? v : undefined)),
  /** Si se omite, la preparación por defecto del tipo; vacía o null, sin preparación (D27). */
  preparacion: z
    .string()
    .trim()
    .max(500, 'La preparación puede tener hasta 500 caracteres')
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  observaciones,
});

/** PATCH /api/estudios/:id — reprogramar un estudio programado (T512). */
export const esquemaReprogramarEstudio = z.object({ fechaHora });

/** POST /api/estudios/:id/cancelar — cancelar con el motivo (T512). */
export const esquemaCancelarEstudio = z.object({
  motivo: z
    .string({ error: 'Indique por qué se cancela el estudio' })
    .trim()
    .min(3, 'Indique por qué se cancela el estudio')
    .max(255, 'El motivo puede tener hasta 255 caracteres'),
});

/** POST /api/estudios/:id/confirmar — enfermería confirma con su rostro que se realizó (T513). */
export const esquemaConfirmarEstudio = z.object({
  /** Comprobante de la validación facial (POST /api/biometria/validar). */
  validacionToken: z.string().optional(),
  observaciones,
});

/** GET /api/pacientes/:id/estudios?estado */
export const esquemaFiltroEstudios = z.object({
  estado: z.enum(ESTADOS_ESTUDIO, { error: 'Estado inválido' }).optional(),
});

export type ProgramacionEstudio = z.infer<typeof esquemaProgramarEstudio>;
export type ReprogramacionEstudio = z.infer<typeof esquemaReprogramarEstudio>;
export type CancelacionEstudio = z.infer<typeof esquemaCancelarEstudio>;
export type ConfirmacionEstudio = z.infer<typeof esquemaConfirmarEstudio>;
