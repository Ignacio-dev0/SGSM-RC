import { reloj } from './reloj';

/** Zona horaria del hospital: las fechas "del día" se cuentan en hora de Argentina. */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

/** Fecha de hoy en Argentina como 'AAAA-MM-DD' (no la de UTC, que a la noche ya es mañana). */
export const hoyEnArgentina = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(reloj.ahora());

const formatoHora = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: ZONA_HORARIA,
});

/** Hora de Argentina en 24 h ('08:05') para los mensajes que lee una persona. */
export const horaArgentina = (fecha: Date) => formatoHora.format(fecha);

// ─── Días de calendario en hora de Argentina (reportes, E6 · S18) ──────────────────────────

const DIA_MS = 86_400_000;

const formatoDesfase = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA,
  timeZoneName: 'longOffset',
});

/** Instante en que empieza el día 'AAAA-MM-DD' en Argentina (00:00 de la zona del hospital). */
export function inicioDelDia(fecha: string): Date {
  const parte = formatoDesfase
    .formatToParts(new Date(`${fecha}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName');
  // 'GMT-03:00' → '-03:00'; 'GMT' a secas es UTC.
  const desfase = parte?.value.replace('GMT', '') || '+00:00';
  return new Date(`${fecha}T00:00:00${desfase}`);
}

/** Suma (o resta) días de calendario a una fecha 'AAAA-MM-DD'. */
export const sumarDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);

/** Cantidad de días de un rango 'AAAA-MM-DD', con los dos extremos incluidos. */
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS) + 1;

const formatoFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA });

/** Fecha 'AAAA-MM-DD' de un instante, en Argentina. */
export const fechaEnArgentina = (instante: Date) => formatoFecha.format(instante);

/** 'AAAA-MM-DD' → 'DD/MM/AAAA', como se lee en Argentina. */
export const fechaLegible = (fecha: string) => fecha.split('-').reverse().join('/');

/** Fecha y hora de Argentina para leer: '07/10/2026 23:05'. */
export const fechaHoraLegible = (instante: Date) =>
  `${fechaLegible(fechaEnArgentina(instante))} ${horaArgentina(instante)}`;
