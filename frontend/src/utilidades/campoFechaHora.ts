/**
 * Ida y vuelta entre un momento (ISO) y el valor de un campo `datetime-local` ("AAAA-MM-DDTHH:mm",
 * sin zona), siempre en hora de Argentina, como el resto de las horas de la app (formato.ts). Así
 * el campo dice la misma hora que el listado aunque la tablet tenga otra zona configurada (E5-16).
 */
import { ZONA } from './formato';

const PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Año, mes, día, hora, minuto y segundo de `ms` en hora de Argentina. */
function partesEnZona(ms: number) {
  const p: Record<string, number> = {};
  for (const { type, value } of PARTES.formatToParts(ms)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

/** Diferencia (en ms) entre la hora de Argentina y UTC en el momento `ms` (−3 h = −10 800 000). */
function desfaseEnZona(ms: number) {
  const p = partesEnZona(ms);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoUtc - (ms - (ms % 1000));
}

const dos = (n: number) => String(n).padStart(2, '0');

/** "2026-10-08T10:00" (hora de Argentina) para un campo datetime-local; los segundos no se usan. */
export function campoFechaHora(fecha: string | Date): string {
  const p = partesEnZona(new Date(fecha).getTime());
  return `${p.year}-${dos(p.month)}-${dos(p.day)}T${dos(p.hour)}:${dos(p.minute)}`;
}

const FORMATO_CAMPO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** El momento que eligió el campo (leído como hora de Argentina), en ms; NaN si no es una fecha. */
export function msDeCampoFechaHora(valor: string): number {
  const m = FORMATO_CAMPO.exec(valor);
  if (!m) return Number.NaN;
  const [anio, mes, dia, hora, minuto] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return Number.NaN;
  const comoUtc = Date.UTC(anio, mes - 1, dia, hora, minuto);
  // El desfase se mira en el momento resultante (por si la zona cambiara de horario ese día).
  const aproximado = comoUtc - desfaseEnZona(comoUtc);
  return comoUtc - desfaseEnZona(aproximado);
}

/** Lo elegido en el campo como ISO en UTC, para mandar a la API; '' si no es una fecha. */
export function isoDeCampoFechaHora(valor: string): string {
  const ms = msDeCampoFechaHora(valor);
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString();
}
