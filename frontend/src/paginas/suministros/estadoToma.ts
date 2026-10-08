import type { Prescripcion } from '../../api/tipos';
import { formatearHora } from '../../utilidades/formato';
import { tomaMasCercana } from '../prescripciones/agenda';

/**
 * En qué punto está la toma de una prescripción respecto de ahora, para que quien administra lo
 * vea antes de elegir (CU20 · RN07). Usa los mismos criterios que el servidor:
 * - la próxima toma pendiente sigue siéndolo hasta 30 minutos después de su hora;
 * - ya se dio si alguna administración quedó en la toma de ahora (la más cercana, D121) o si la
 *   última fue hace menos de media frecuencia, aunque sea de antes de reanudar (D123): son los
 *   dos casos en que el servidor responde `TOMA_YA_DADA`.
 * Solo avisa: no impide registrar (la decisión clínica es de quien administra).
 */

/** Antes de esta cantidad de minutos, la toma "toca ahora". */
export const MARGEN_AHORA_MINUTOS = 30;

export type EstadoToma =
  | {
      tipo: 'dada';
      minutos: number;
      fechaHora: string;
      usuario: string;
      /** Como el `detalles.motivo` del 409: la misma toma, o una dosis reciente de otra (D123). */
      motivo: 'misma-toma' | 'dosis-reciente';
    }
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

type DatosEstado = Pick<
  Prescripcion,
  'fechaInicio' | 'fechaFin' | 'frecuenciaHoras' | 'proximaToma' | 'ultimasAdministraciones'
> &
  Partial<Pick<Prescripcion, 'agendaDesde'>>;

/**
 * La administración por la que el servidor rechazaría otra ahora (D113 · D123), o undefined, con
 * el motivo: la de esta misma toma, o una dosis reciente de otra toma (por ejemplo, de antes de
 * reanudar).
 */
function administracionPrevia(p: DatosEstado, ahora: Date) {
  const toma = tomaMasCercana(p, ahora);
  const deLaToma = p.ultimasAdministraciones.find(
    (a) =>
      toma !== null &&
      typeof a.tomaProgramada === 'string' &&
      Date.parse(a.tomaProgramada) === toma,
  );
  if (deLaToma) return { administracion: deLaToma, motivo: 'misma-toma' as const };
  const ultima = p.ultimasAdministraciones[0];
  if (!ultima) return undefined;
  const dada = Date.parse(ultima.fechaHora);
  const hace = ahora.getTime() - dada;
  if (hace < 0 || hace >= (p.frecuenciaHoras * 60 * MINUTO) / 2) return undefined;
  // Es otra toma si se dio antes del ancla (reanudar) o si su toma guardada es otra (D121); sin
  // la toma guardada (datos viejos) se la trata como la misma, que es el aviso más prudente.
  const antesDelAncla = typeof p.agendaDesde === 'string' && dada < Date.parse(p.agendaDesde);
  const otraTomaGuardada =
    typeof ultima.tomaProgramada === 'string' && Date.parse(ultima.tomaProgramada) !== toma;
  const motivo: 'misma-toma' | 'dosis-reciente' =
    antesDelAncla || otraTomaGuardada ? 'dosis-reciente' : 'misma-toma';
  return { administracion: ultima, motivo };
}

export function estadoToma(p: DatosEstado, ahora = new Date()): EstadoToma {
  const previa = administracionPrevia(p, ahora);
  if (previa) {
    const { administracion: a, motivo } = previa;
    const minutos = Math.round((ahora.getTime() - Date.parse(a.fechaHora)) / MINUTO);
    return { tipo: 'dada', minutos, fechaHora: a.fechaHora, usuario: a.usuario, motivo };
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
      // Hora absoluta (como el aviso al elegirla): la relativa no se puede cotejar con el historial.
      return `Ya se dio a las ${formatearHora(e.fechaHora)}`;
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

/**
 * Una toma ya dada es una advertencia (riesgo de duplicar la dosis), no un "todo bien": va en
 * color de advertencia y con contorno para no confundirse con la atrasada, que va rellena.
 */
const COLORES = {
  dada: 'warning',
  atrasada: 'warning',
  ahora: 'primary',
  falta: 'default',
  'sin-tomas': 'default',
} as const satisfies Record<EstadoToma['tipo'], 'warning' | 'primary' | 'default'>;

export const colorEstadoToma = (e: EstadoToma) => COLORES[e.tipo];

/** Relleno solo para lo que pide acción ahora (toca o está atrasada); el resto, con contorno. */
export const varianteEstadoToma = (e: EstadoToma): 'filled' | 'outlined' =>
  e.tipo === 'ahora' || e.tipo === 'atrasada' ? 'filled' : 'outlined';
