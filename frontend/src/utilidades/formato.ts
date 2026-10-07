/**
 * Formatos de fecha y hora para mostrar en pantalla, siempre en hora de Argentina y con horas de
 * 24 ("19:00", no "07:00 p. m."): en una dosis, a. m./p. m. es una fuente de errores.
 */

const ZONA = 'America/Argentina/Buenos_Aires';

export const formatearFecha = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: ZONA,
      })
    : '—';

export const formatearHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: ZONA,
      })
    : '—';

export const formatearFechaHora = (iso: string | null | undefined) =>
  iso ? `${formatearFecha(iso)} ${formatearHora(iso)}` : '—';

/** Fecha de nacimiento (columna `date`): se muestra sin convertir de zona horaria. */
export const formatearFechaSinZona = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

export function edad(fechaNacimiento: string, hoy = new Date()) {
  const [a, m, d] = fechaNacimiento.slice(0, 10).split('-').map(Number) as [number, number, number];
  let anios = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) anios--;
  return anios;
}
