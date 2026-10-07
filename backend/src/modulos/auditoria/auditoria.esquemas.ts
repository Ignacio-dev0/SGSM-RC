import { z } from 'zod';

/**
 * Filtros de la consulta de auditoría (E6 · T604 · CU35). Solo dependen de zod: el frontend los
 * puede importar como contrato. Ver docs/reportes.md.
 */

export const TAMANO_POR_DEFECTO = 50;
export const TAMANO_MAXIMO = 100;

const fecha = (campo: 'desde' | 'hasta') =>
  z.iso.date({ error: `Indique la fecha "${campo}" como AAAA-MM-DD` }).optional();

const id = (mensaje: string) =>
  z.coerce.number({ error: mensaje }).int().positive(mensaje).optional();

const texto = (mensaje: string) =>
  z.string({ error: mensaje }).trim().min(1, mensaje).max(40, mensaje).optional();

const tamano = z.coerce
  .number({ error: 'Indique cuántos registros por página' })
  .int('Indique cuántos registros por página')
  .min(1, 'Indique cuántos registros por página')
  .max(TAMANO_MAXIMO, `Se pueden pedir hasta ${TAMANO_MAXIMO} registros por página`)
  .optional();

/** De dónde viene el movimiento (D101): personas = con usuario; sistema = sin usuario. */
export const ORIGENES = ['personas', 'sistema'] as const;
export type OrigenAuditoria = (typeof ORIGENES)[number];

/** GET /api/auditoria?desde&hasta&usuarioId&pacienteId&accion&entidad&origen&pagina&tamano */
export const esquemaBusquedaAuditoria = z
  .object({
    /** Días en hora de Argentina, los dos incluidos (como en los reportes). */
    desde: fecha('desde'),
    hasta: fecha('hasta'),
    usuarioId: id('Elija un usuario'),
    pacienteId: id('Elija un paciente'),
    accion: texto('Elija una acción'),
    entidad: texto('Elija una entidad'),
    /** Sin él, todos (ESC2 · D101). */
    origen: z.enum(ORIGENES, { error: 'El origen debe ser "personas" o "sistema"' }).optional(),
    pagina: z.coerce
      .number({ error: 'La página empieza en 1' })
      .int('La página empieza en 1')
      .min(1, 'La página empieza en 1')
      .default(1),
    tamano,
    /** Sinónimo de `tamano`, el nombre de la convención de la API (D48). */
    porPagina: tamano,
  })
  .transform(({ tamano, porPagina, ...filtros }, ctx) => {
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      ctx.addIssue({
        code: 'custom',
        path: ['hasta'],
        message: 'La fecha "hasta" no puede ser anterior a "desde"',
      });
      return z.NEVER;
    }
    return { ...filtros, tamano: tamano ?? porPagina ?? TAMANO_POR_DEFECTO };
  });

export type BusquedaAuditoria = z.output<typeof esquemaBusquedaAuditoria>;
