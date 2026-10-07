/**
 * Período de los reportes (E6 · S18 · D40): días de calendario en hora de Argentina, con los dos
 * extremos incluidos. Las reglas y los mensajes son los del backend
 * (`backend/src/modulos/reportes/reportes.esquemas.ts`); la prueba los compara con el esquema real.
 */
import { formatearFechaSinZona } from '../../utilidades/formato';

const ZONA = 'America/Argentina/Buenos_Aires';
const DIA_MS = 86_400_000;

/** Sin fechas, el período son los últimos 7 días (hoy incluido), como en el servidor. */
const DIAS_POR_DEFECTO = 7;
/** Período más largo que acepta el servidor (un año, bisiesto incluido). */
export const DIAS_MAXIMOS = 366;

/** Fecha de hoy en Argentina como 'AAAA-MM-DD' (no la de UTC, que a la noche ya es mañana). */
export const hoyEnArgentina = (ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);

/** Suma (o resta) días de calendario a una fecha 'AAAA-MM-DD'. */
export const sumarDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);

/** Cantidad de días de un rango 'AAAA-MM-DD', con los dos extremos incluidos. */
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS) + 1;

/** Atajos del período: cuántos días terminan hoy. */
export const ATAJOS = [
  { valor: 'hoy', etiqueta: 'Hoy', dias: 1 },
  { valor: '7', etiqueta: '7 días', dias: DIAS_POR_DEFECTO },
  { valor: '30', etiqueta: '30 días', dias: 30 },
] as const;

export type Atajo = (typeof ATAJOS)[number]['valor'];
export const ATAJO_POR_DEFECTO: Atajo = '7';

export interface PeriodoEnUrl {
  /** Atajo elegido; solo cuenta si no hay fechas. */
  periodo: string;
  desde: string;
  hasta: string;
}

/**
 * Las fechas que se piden. Con fechas elegidas mandan ellas (con una sola se completa como el
 * servidor: solo "desde" llega hasta hoy; solo "hasta" son los 7 días que terminan ese día); sin
 * fechas, el atajo, siempre contado desde el hoy de ese momento.
 */
export function periodoEfectivo(
  { periodo, desde, hasta }: PeriodoEnUrl,
  hoy = hoyEnArgentina(),
): { desde: string; hasta: string; atajo: Atajo | null } {
  if (desde || hasta) {
    const fin = hasta || hoy;
    return { desde: desde || sumarDias(fin, -(DIAS_POR_DEFECTO - 1)), hasta: fin, atajo: null };
  }
  const atajo = ATAJOS.find((a) => a.valor === periodo) ?? ATAJOS[1];
  return { desde: sumarDias(hoy, -(atajo.dias - 1)), hasta: hoy, atajo: atajo.valor };
}

/** ¿Es un día real escrito como 'AAAA-MM-DD'? (2026-02-30 no lo es). */
const esFecha = (f: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(f) &&
  !Number.isNaN(Date.parse(`${f}T00:00:00Z`)) &&
  new Date(`${f}T00:00:00Z`).toISOString().startsWith(f);

export type CampoFecha = 'desde' | 'hasta';
export type ErroresPeriodo = Partial<Record<CampoFecha, string>>;

/** Quien usa el selector de fechas no escribe "AAAA-MM-DD": se le pide una fecha (E6-13). */
export const FECHA_INVALIDA = 'Elija una fecha válida';
const HASTA_ANTES = 'La fecha "hasta" no puede ser anterior a "desde"';
const DESDE_DESPUES = 'La fecha "desde" no puede ser posterior a "hasta"';
const MUY_LARGO = `El período puede tener hasta ${DIAS_MAXIMOS} días`;

/** Un campo que quedó vacío: no se repone solo, se pide (E6-13). */
export const fechaVacia = (campo: CampoFecha) => `Elija la fecha "${campo}"`;

/**
 * Errores del período por campo, en el mismo campo que el servidor y con sus mensajes (salvo el
 * de una fecha mal escrita, que se dice en palabras de la persona): lo que se ve es lo que diría
 * el 400 si el pedido llegara.
 */
export function validarPeriodo(desde: string, hasta: string): ErroresPeriodo {
  const errores: ErroresPeriodo = {};
  if (!esFecha(desde)) errores.desde = FECHA_INVALIDA;
  if (!esFecha(hasta)) errores.hasta = FECHA_INVALIDA;
  if (errores.desde || errores.hasta) return errores;
  if (desde > hasta) return { hasta: HASTA_ANTES };
  if (diasEntre(desde, hasta) > DIAS_MAXIMOS) return { desde: MUY_LARGO };
  return {};
}

/**
 * Un error del rango (el orden o el largo) es de los dos campos: se muestra bajo el que se acaba
 * de cambiar, dicho desde ese campo. Sin saber cuál, queda donde lo pone el servidor.
 */
export function erroresDelCampoCambiado(
  errores: ErroresPeriodo,
  cambiado: CampoFecha | null,
): ErroresPeriodo {
  if (cambiado === 'desde' && errores.hasta === HASTA_ANTES) return { desde: DESDE_DESPUES };
  if (cambiado === 'hasta' && errores.desde === MUY_LARGO) return { hasta: MUY_LARGO };
  return errores;
}

/** Un error de fecha del servidor (un 400 que igual llegó), en las mismas palabras. */
export const enPalabrasDeLaPersona = (mensaje: string | undefined) =>
  mensaje && /AAAA-MM-DD/.test(mensaje) ? FECHA_INVALIDA : mensaje;

/** "Del 01/10/2026 al 07/10/2026 (7 días)"; un solo día: "El 07/10/2026 (1 día)". */
export function textoDelPeriodo(desde: string, hasta: string) {
  const dias = diasEntre(desde, hasta);
  if (dias === 1) return `El ${formatearFechaSinZona(desde)} (1 día)`;
  return `Del ${formatearFechaSinZona(desde)} al ${formatearFechaSinZona(hasta)} (${dias} días)`;
}
