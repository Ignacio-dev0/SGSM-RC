import { z } from 'zod';
import { diasEntre, hoyEnArgentina, sumarDias } from '../../comun/fechas';

/**
 * Parámetros de los reportes y las estadísticas (E6 · T601–T603). Las fechas son días de
 * calendario en hora de Argentina, con los dos extremos incluidos (S18). Solo dependen de zod y
 * de las fechas de comun/: el frontend los puede importar como contrato. Ver docs/reportes.md.
 */

export const TIPOS_INSUMO = ['MEDICAMENTO', 'INSUMO'] as const;
export const AGRUPACIONES = ['paciente', 'insumo', 'usuario', 'dia'] as const;
export const FORMATOS = ['pdf', 'xlsx'] as const;

/** Sin fechas, el período son los últimos 7 días (hoy incluido). */
export const DIAS_POR_DEFECTO = 7;
/** Período más largo que se puede pedir (un año, bisiesto incluido). */
export const DIAS_MAXIMOS = 366;

export type TipoInsumoReporte = (typeof TIPOS_INSUMO)[number];
export type Agrupacion = (typeof AGRUPACIONES)[number];
export type Formato = (typeof FORMATOS)[number];

const fecha = (campo: 'desde' | 'hasta') =>
  z.iso.date({ error: `Indique la fecha "${campo}" como AAAA-MM-DD` }).optional();

const camposComunes = {
  desde: fecha('desde'),
  hasta: fecha('hasta'),
  /** Sala de la cama que ocupaba el paciente en ese momento (D41). */
  salaId: z.coerce.number({ error: 'Elija una sala' }).int().positive('Elija una sala').optional(),
  tipo: z.enum(TIPOS_INSUMO, { error: 'El tipo es MEDICAMENTO o INSUMO' }).optional(),
};

const agruparPor = z
  .enum(AGRUPACIONES, { error: 'Agrupe por paciente, insumo, usuario o día' })
  .default('paciente');

const formato = z.enum(FORMATOS, { error: 'Elija el formato: pdf o xlsx' });

type Crudo = { desde?: string; hasta?: string; salaId?: number; tipo?: TipoInsumoReporte };

/** Completa el período por defecto y controla que sea un rango válido. */
function normalizar<T extends Crudo>(
  { desde, hasta, salaId, tipo, ...resto }: T,
  ctx: z.RefinementCtx,
) {
  const fin = hasta ?? hoyEnArgentina();
  const inicio = desde ?? sumarDias(fin, -(DIAS_POR_DEFECTO - 1));
  if (inicio > fin) {
    ctx.addIssue({
      code: 'custom',
      path: ['hasta'],
      message: 'La fecha "hasta" no puede ser anterior a "desde"',
    });
    return z.NEVER;
  }
  if (diasEntre(inicio, fin) > DIAS_MAXIMOS) {
    ctx.addIssue({
      code: 'custom',
      path: ['desde'],
      message: `El período puede tener hasta ${DIAS_MAXIMOS} días`,
    });
    return z.NEVER;
  }
  return { desde: inicio, hasta: fin, salaId: salaId ?? null, tipo: tipo ?? null, ...resto };
}

/** GET /api/reportes/estadisticas?desde&hasta&salaId&tipo */
export const esquemaEstadisticas = z.object(camposComunes).transform(normalizar);

/** GET /api/reportes/suministros?desde&hasta&salaId&tipo&agruparPor */
export const esquemaReporteSuministros = z
  .object({ ...camposComunes, agruparPor })
  .transform(normalizar);

/** GET /api/reportes/suministros/exportar?formato&… (los mismos del reporte) */
export const esquemaExportarSuministros = z
  .object({ ...camposComunes, agruparPor, formato })
  .transform(normalizar);

/** GET /api/reportes/estadisticas/exportar?formato&… (los mismos de las estadísticas) */
export const esquemaExportarEstadisticas = z
  .object({ ...camposComunes, formato })
  .transform(normalizar);

/** Período, sala y tipo ya normalizados: lo que reciben los servicios y lo que vuelve en `meta`. */
export type Periodo = z.output<typeof esquemaEstadisticas>;
export type ParametrosReporte = z.output<typeof esquemaReporteSuministros>;
export type ExportarSuministros = z.output<typeof esquemaExportarSuministros>;
export type ExportarEstadisticas = z.output<typeof esquemaExportarEstadisticas>;
