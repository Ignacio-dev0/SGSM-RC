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

/** "07/10 08:00": día, mes y hora, para nombrar un registro sin repetir el año. */
export const formatearFechaHoraCorta = (iso: string | null | undefined) =>
  iso ? formatearFechaHora(iso).replace(/\/\d{4}/, '') : '—';

/** Espacio no separable: el renglón no se parte ahí. */
const ESPACIO_NO_SEPARABLE = String.fromCharCode(160);

/**
 * Une con espacios no separables el número y su unidad, para que un renglón no deje "500" en
 * una línea y "mg" en la otra: "Comprimidos 500 mg", "Gasa estéril 10 x 10 cm", "Paquete x 10".
 * El resto de los espacios quedan como están: el texto largo sigue pudiendo cortar.
 */
export const sinCortes = (texto: string) =>
  texto
    // Número + unidad ("500 mg", "0,9 %") y el número que le sigue a una "x" ("x 10").
    .replace(/(\d) +(?=[\p{L}%])/gu, `$1${ESPACIO_NO_SEPARABLE}`)
    .replace(/(^|\s)([xX×]) +(?=\d)/gu, `$1$2${ESPACIO_NO_SEPARABLE}`);

/** "AAAA-MM-DD" (de los campos de fecha) → "entre el 01/10/2026 y el 05/10/2026". */
export function rangoDeFechas(desde: string, hasta: string) {
  if (desde && hasta) {
    return `entre el ${formatearFechaSinZona(desde)} y el ${formatearFechaSinZona(hasta)}`;
  }
  if (desde) return `desde el ${formatearFechaSinZona(desde)}`;
  if (hasta) return `hasta el ${formatearFechaSinZona(hasta)}`;
  return '';
}
