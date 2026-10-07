import { formatearFecha, formatearHora } from '../../utilidades/formato';

const DIA_MS = 86_400_000;

/** Número de día de un instante en hora de Argentina, para comparar días sin depender de la zona del navegador. */
function numeroDeDia(iso: string) {
  const [dia, mes, anio] = formatearFecha(iso).split('/').map(Number) as [number, number, number];
  return Date.UTC(anio, mes - 1, dia) / DIA_MS;
}

/**
 * Cuándo es una toma, con su día: "hoy 08:00", "mañana 08:00", "ayer 22:00" o "09/10 08:00".
 * Con frecuencias de 24, 48 o 72 horas la hora sola no dice si la toma es hoy o pasado mañana,
 * ni si una toma ya pasó. Hora de 24 horas y zona de Argentina.
 */
export function formatearProximaToma(iso: string | null | undefined, ahora = new Date()) {
  if (!iso) return '—';
  const hora = formatearHora(iso);
  const dias = numeroDeDia(iso) - numeroDeDia(ahora.toISOString());
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `mañana ${hora}`;
  if (dias === -1) return `ayer ${hora}`;
  return `${formatearFecha(iso).slice(0, 5)} ${hora}`;
}
