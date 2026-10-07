import type { Prescripcion } from '../../api/tipos';

/**
 * En qué punto está la toma de una prescripción respecto de ahora, para que quien administra lo
 * vea antes de elegir (CU20 · RN07). Usa los mismos criterios que el servidor:
 * - la próxima toma pendiente sigue siéndolo hasta 30 minutos después de su hora;
 * - una administración corresponde a la toma más cercana, así que si la última fue hace menos
 *   de media frecuencia, la toma de ahora ya se dio.
 * Solo avisa: no impide registrar (la decisión clínica es de quien administra).
 */

/** Antes de esta cantidad de minutos, la toma "toca ahora". */
export const MARGEN_AHORA_MINUTOS = 30;

export type EstadoToma =
  | { tipo: 'dada'; minutos: number; fechaHora: string; usuario: string }
  | { tipo: 'atrasada'; minutos: number; toma: string }
  | { tipo: 'ahora'; toma: string }
  | { tipo: 'falta'; minutos: number; toma: string }
  | { tipo: 'sin-tomas' };

const MINUTO = 60_000;

/** "45 min", "1 h", "3 h 5 min". */
export function duracion(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function estadoToma(
  p: Pick<Prescripcion, 'frecuenciaHoras' | 'proximaToma' | 'ultimasAdministraciones'>,
  ahora = new Date(),
): EstadoToma {
  const ultima = p.ultimasAdministraciones[0];
  if (ultima) {
    const hace = Math.round((ahora.getTime() - new Date(ultima.fechaHora).getTime()) / MINUTO);
    if (hace >= 0 && hace < (p.frecuenciaHoras * 60) / 2) {
      return { tipo: 'dada', minutos: hace, fechaHora: ultima.fechaHora, usuario: ultima.usuario };
    }
  }
  if (!p.proximaToma) return { tipo: 'sin-tomas' };
  const faltan = Math.round((new Date(p.proximaToma).getTime() - ahora.getTime()) / MINUTO);
  if (faltan < 0) return { tipo: 'atrasada', minutos: -faltan, toma: p.proximaToma };
  if (faltan <= MARGEN_AHORA_MINUTOS) return { tipo: 'ahora', toma: p.proximaToma };
  return { tipo: 'falta', minutos: faltan, toma: p.proximaToma };
}

export function textoEstadoToma(e: EstadoToma) {
  switch (e.tipo) {
    case 'dada':
      return `Ya se dio hace ${duracion(e.minutos)}`;
    case 'atrasada':
      return `Atrasada ${duracion(e.minutos)}`;
    case 'ahora':
      return 'Toca ahora';
    case 'falta':
      return `Faltan ${duracion(e.minutos)}`;
    case 'sin-tomas':
      return 'Sin más tomas';
  }
}

const COLORES = {
  dada: 'success',
  atrasada: 'warning',
  ahora: 'primary',
  falta: 'default',
  'sin-tomas': 'default',
} as const satisfies Record<EstadoToma['tipo'], 'success' | 'warning' | 'primary' | 'default'>;

export const colorEstadoToma = (e: EstadoToma) => COLORES[e.tipo];
