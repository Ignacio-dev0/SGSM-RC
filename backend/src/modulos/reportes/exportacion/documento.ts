import { diasEntre, fechaLegible } from '../../../comun/fechas';

/**
 * Modelo neutro de un documento exportado (T603): lo arman el reporte y las estadísticas, y lo
 * dibujan pdf.ts y excel.ts. Así los dos formatos muestran siempre lo mismo.
 */

export const ENCABEZADO = 'Hospital El Dique · SGSM-RC';

/** Valor de una celda: texto, número, vacío, fecha 'AAAA-MM-DD' o porcentaje de 0 a 100. */
export type Celda = string | number | null | { fecha: string } | { porcentaje: number | null };

export interface Columna {
  titulo: string;
  /** Ancho relativo a las otras columnas de la tabla. */
  ancho: number;
  /** Alineada a la derecha (números). */
  numerica?: boolean;
}

export interface Tabla {
  titulo: string;
  /** Nombre de la hoja en Excel (hasta 31 caracteres). */
  hoja: string;
  columnas: Columna[];
  filas: Celda[][];
  /** Fila de totales, en negrita al final. */
  total?: Celda[];
}

export interface Documento {
  titulo: string;
  desde: string;
  hasta: string;
  /** Parámetros con sus nombres legibles: [['Sala', 'Todas'], ['Tipo', 'Insumos'], …]. */
  filtros: [string, string][];
  emitido: Date;
  /** "Apellido, Nombre" de quien lo generó. */
  autor: string;
  tablas: Tabla[];
}

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
const porcentaje = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** La celda como texto para leer (PDF): 1.014 · 07/10/2026 · 66,7 %. */
export function celdaComoTexto(celda: Celda): string {
  if (celda === null) return '';
  if (typeof celda === 'number') return numero.format(celda);
  if (typeof celda === 'string') return celda;
  if ('fecha' in celda) return fechaLegible(celda.fecha);
  return celda.porcentaje === null ? '—' : `${porcentaje.format(celda.porcentaje)} %`;
}

/** "Período: 01/10/2026 al 07/10/2026 (7 días)" */
export function periodoLegible({ desde, hasta }: Pick<Documento, 'desde' | 'hasta'>) {
  const dias = diasEntre(desde, hasta);
  return `${fechaLegible(desde)} al ${fechaLegible(hasta)} (${dias} ${dias === 1 ? 'día' : 'días'})`;
}
