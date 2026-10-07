import { reloj } from './reloj';

/** Zona horaria del hospital: las fechas "del día" se cuentan en hora de Argentina. */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

/** Fecha de hoy en Argentina como 'AAAA-MM-DD' (no la de UTC, que a la noche ya es mañana). */
export const hoyEnArgentina = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(reloj.ahora());
