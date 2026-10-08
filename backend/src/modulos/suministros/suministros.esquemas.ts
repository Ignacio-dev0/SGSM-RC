import { z } from 'zod';
import { esquemaPaginacion } from '../../comun/paginacion';

const cantidad = z
  .number({ error: 'Ingrese la cantidad' })
  .positive('La cantidad debe ser mayor a 0')
  .max(100_000, 'La cantidad es demasiado grande');

const observaciones = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => (v ? v : null));

const id = (mensaje: string) => z.number({ error: mensaje }).int().positive(mensaje);

/** Comprobante de la validación facial (POST /api/biometria/validar). */
const validacionToken = z.string().optional();

const items = z
  .array(z.object({ insumoId: id('Elija el insumo'), cantidad }))
  .min(1, 'Agregue al menos un insumo')
  .max(30, 'Se pueden registrar hasta 30 insumos por movimiento')
  .refine(
    (lista) => new Set(lista.map((i) => i.insumoId)).size === lista.length,
    'Hay insumos repetidos: sume las cantidades en una sola línea',
  );

export const esquemaAdministracion = z.object({
  pacienteId: id('Elija el paciente'),
  prescripcionId: id('Elija la prescripción'),
  /** Si se omite, se registra la dosis prescripta. */
  cantidad: cantidad.optional(),
  observaciones,
  validacionToken,
  /**
   * D113: la persona marcó "Corresponde dar otra toma". Sin esto, si la toma ya tiene una
   * administración, responde 409 TOMA_YA_DADA.
   */
  otraToma: z.boolean({ error: 'Indique si corresponde dar otra toma' }).default(false),
});

export const esquemaInsumos = z.object({
  pacienteId: id('Elija el paciente'),
  items,
  observaciones,
  validacionToken,
});

export const esquemaCorreccion = z.object({
  motivo: z
    .string({ error: 'Indique el motivo de la corrección' })
    .trim()
    .min(3, 'Indique el motivo de la corrección')
    .max(255),
  /** Para una administración de medicamento: la cantidad correcta. */
  cantidad: cantidad.optional(),
  /** Para un movimiento de insumos: la lista correcta completa. */
  items: items.optional(),
  /** Si se omite, las observaciones quedan como estaban; '' o null las borra. */
  observaciones: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  validacionToken,
});

export const esquemaBusquedaSuministros = esquemaPaginacion.extend({
  pacienteId: z.coerce.number().int().positive().optional(),
  usuarioId: z.coerce.number().int().positive().optional(),
  /** Tipo de insumo: MEDICAMENTO o INSUMO (no medicinal). */
  tipoInsumo: z.enum(['MEDICAMENTO', 'INSUMO']).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

export type Administracion = z.infer<typeof esquemaAdministracion>;
export type RegistroInsumos = z.infer<typeof esquemaInsumos>;
export type Correccion = z.infer<typeof esquemaCorreccion>;
export type BusquedaSuministros = z.infer<typeof esquemaBusquedaSuministros>;
