import { z } from 'zod';

export const VIAS = [
  'ORAL',
  'SUBLINGUAL',
  'INTRAVENOSA',
  'INTRAMUSCULAR',
  'SUBCUTANEA',
  'TOPICA',
  'INHALATORIA',
  'SONDA',
  'RECTAL',
  'OTRA',
] as const;

const fechaHora = z.iso.datetime({ offset: true, error: 'Fecha y hora inválida' });

const camposEditables = {
  dosis: z
    .number({ error: 'Ingrese la dosis' })
    .positive('La dosis debe ser mayor a 0')
    .max(100_000, 'La dosis es demasiado grande'),
  unidadDosis: z.string({ error: 'Ingrese la unidad' }).trim().min(1, 'Ingrese la unidad').max(30),
  frecuenciaHoras: z
    .number({ error: 'Ingrese la frecuencia' })
    .int('La frecuencia es en horas enteras')
    .min(1, 'La frecuencia mínima es cada 1 hora')
    .max(168, 'La frecuencia máxima es cada 168 horas (una semana)'),
  via: z.enum(VIAS, { error: 'Elija la vía de administración' }),
  fechaFin: fechaHora.nullish(),
  observaciones: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
};

const fechasValidas = z.object({ fechaInicio: fechaHora, fechaFin: fechaHora.nullish() });

export const esquemaAltaPrescripcion = z
  .object({
    insumoId: z.number({ error: 'Elija el medicamento' }).int().positive('Elija el medicamento'),
    ...camposEditables,
    fechaInicio: fechaHora,
    /** T307: confirmar la carga aunque ya exista otra vigente del mismo medicamento. */
    confirmarDuplicada: z.boolean().default(false),
  })
  .refine((d) => !d.fechaFin || new Date(d.fechaFin) > new Date(d.fechaInicio), {
    path: ['fechaFin'],
    message: 'La fecha de fin debe ser posterior al inicio',
    // Se evalúa aunque otros campos tengan errores, para mostrarlos todos juntos.
    when: (p) => fechasValidas.safeParse(p.value).success,
  });

export const esquemaModificacionPrescripcion = z
  .object(camposEditables)
  .partial()
  .extend({
    motivo: z
      .string({ error: 'Indique el motivo del cambio' })
      .trim()
      .min(3, 'Indique el motivo del cambio')
      .max(255),
  });

export const esquemaCambioEstado = z.object({
  estado: z.enum(['VIGENTE', 'SUSPENDIDA', 'FINALIZADA'], { error: 'Estado inválido' }),
  motivo: z.string({ error: 'Indique el motivo' }).trim().min(3, 'Indique el motivo').max(255),
});

export const esquemaFiltroEstado = z.object({
  estado: z.enum(['VIGENTE', 'SUSPENDIDA', 'FINALIZADA']).optional(),
});

export type AltaPrescripcion = z.infer<typeof esquemaAltaPrescripcion>;
export type ModificacionPrescripcion = z.infer<typeof esquemaModificacionPrescripcion>;
