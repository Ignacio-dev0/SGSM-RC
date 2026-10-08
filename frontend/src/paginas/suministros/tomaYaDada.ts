import { ErrorApi } from '../../api/cliente';
import { formatearHora } from '../../utilidades/formato';
import { duracion } from './estadoToma';

/**
 * El 409 TOMA_YA_DADA del servidor (D113 · D123 · C1) en palabras de la pantalla de Administrar.
 * `detalles.motivo` dice cuál de los dos casos fue:
 * - `MISMA_TOMA`: la toma de ahora ya tiene su administración;
 * - `DOSIS_RECIENTE`: hace menos de media frecuencia se dio una dosis de otra toma (por ejemplo,
 *   antes de reanudar). Ahí no se puede decir "esta toma".
 */

export type MotivoTomaYaDada = 'MISMA_TOMA' | 'DOSIS_RECIENTE';

export interface TomaYaDada {
  motivo: MotivoTomaYaDada;
  fechaHora: string | null;
  usuario: string | null;
}

/** La administración que el servidor encontró (409 TOMA_YA_DADA), o null. */
export function tomaYaDadaEn(error: unknown): TomaYaDada | null {
  if (!(error instanceof ErrorApi) || error.codigo !== 'TOMA_YA_DADA') return null;
  const d = (error.detalles ?? {}) as { motivo?: unknown; fechaHora?: unknown; usuario?: unknown };
  return {
    // Sin motivo (un servidor anterior), el caso de siempre: la misma toma.
    motivo: d.motivo === 'DOSIS_RECIENTE' ? 'DOSIS_RECIENTE' : 'MISMA_TOMA',
    fechaHora: typeof d.fechaHora === 'string' ? d.fechaHora : null,
    usuario: typeof d.usuario === 'string' ? d.usuario : null,
  };
}

const SI_CORRESPONDE = 'Si corresponde dar otra, márquelo y vuelva a confirmar.';

/**
 * - MISMA_TOMA: "Esta toma ya se registró a las 08:05 (Acosta, Sofía). Si corresponde…"
 * - DOSIS_RECIENTE: "Hace 40 min se registró una dosis de este medicamento (a las 11:20, Acosta,
 *   Sofía). Si corresponde…"
 */
export function textoTomaYaDada({ motivo, fechaHora, usuario }: TomaYaDada, ahora: Date) {
  if (motivo === 'DOSIS_RECIENTE') {
    const minutos = fechaHora
      ? Math.max(1, Math.round((ahora.getTime() - Date.parse(fechaHora)) / 60_000))
      : null;
    const hace = minutos !== null ? `Hace ${duracion(minutos)}` : 'Hace poco';
    const datos = [fechaHora && `a las ${formatearHora(fechaHora)}`, usuario].filter(Boolean);
    const entre = datos.length > 0 ? ` (${datos.join(', ')})` : '';
    return `${hace} se registró una dosis de este medicamento${entre}. ${SI_CORRESPONDE}`;
  }
  const cuando = fechaHora ? ` a las ${formatearHora(fechaHora)}` : '';
  const quien = usuario ? ` (${usuario})` : '';
  return `Esta toma ya se registró${cuando}${quien}. ${SI_CORRESPONDE}`;
}
