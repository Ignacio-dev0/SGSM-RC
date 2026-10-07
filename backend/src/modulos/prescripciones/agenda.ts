/**
 * Cálculo de horarios de administración (T302 · CU17 · RF07). Funciones puras: a partir de la
 * fecha de inicio y la frecuencia en horas, la toma k es `inicio + k × frecuencia` (k ≥ 0),
 * mientras no pase la fecha de fin del tratamiento. Los recordatorios (E5) y el registro de
 * administraciones (E4) se apoyan en esta misma agenda.
 */

export interface DatosAgenda {
  fechaInicio: Date;
  frecuenciaHoras: number;
  fechaFin: Date | null;
}

const HORA = 3_600_000;
/** Tope de seguridad para no generar listas enormes por un rango mal pedido. */
const MAXIMO_DE_TOMAS = 500;

const intervalo = (p: DatosAgenda) => p.frecuenciaHoras * HORA;
const tomaN = (p: DatosAgenda, k: number) => new Date(p.fechaInicio.getTime() + k * intervalo(p));
const dentroDelTratamiento = (p: DatosAgenda, toma: Date) =>
  p.fechaFin === null || toma.getTime() <= p.fechaFin.getTime();

/** Tomas programadas dentro de [desde, hasta], ambos incluidos. */
export function tomasEntre(p: DatosAgenda, desde: Date, hasta: Date): Date[] {
  if (hasta < desde) return [];
  const desdeInicio = desde.getTime() - p.fechaInicio.getTime();
  let k = Math.max(0, Math.ceil(desdeInicio / intervalo(p)));
  const tomas: Date[] = [];
  for (let t = tomaN(p, k); t <= hasta && tomas.length < MAXIMO_DE_TOMAS; t = tomaN(p, ++k)) {
    if (!dentroDelTratamiento(p, t)) break;
    tomas.push(t);
  }
  return tomas;
}

/** Próxima toma a partir de `ahora` (incluida la que corresponde justo ahora), o null. */
export function proximaToma(p: DatosAgenda & { estado: string }, ahora: Date): Date | null {
  if (p.estado !== 'VIGENTE') return null;
  const desdeInicio = ahora.getTime() - p.fechaInicio.getTime();
  const toma = tomaN(p, Math.max(0, Math.ceil(desdeInicio / intervalo(p))));
  return dentroDelTratamiento(p, toma) ? toma : null;
}

/**
 * Toma programada a la que corresponde una administración hecha en `momento`: la más cercana.
 * Si el momento está más de media frecuencia antes del inicio, no corresponde a ninguna.
 */
export function tomaMasCercana(p: DatosAgenda, momento: Date): Date | null {
  const desdeInicio = momento.getTime() - p.fechaInicio.getTime();
  if (desdeInicio < -intervalo(p) / 2) return null;
  let k = Math.max(0, Math.round(desdeInicio / intervalo(p)));
  while (k > 0 && !dentroDelTratamiento(p, tomaN(p, k))) k--;
  return tomaN(p, k);
}

/** Minutos durante los que una toma no administrada se sigue mostrando como la próxima. */
export const MARGEN_TOMA_MINUTOS = 30;

/**
 * Próxima toma que falta dar: como `proximaToma`, pero una toma de los últimos
 * MARGEN_TOMA_MINUTOS que todavía no se administró sigue siendo la próxima, y una que ya se
 * administró se saltea. Las tomas atrasadas por más tiempo las sigue el módulo de recordatorios.
 */
export function proximaTomaPendiente(
  p: DatosAgenda & { estado: string },
  ahora: Date,
  administraciones: Date[],
): Date | null {
  const desde = new Date(ahora.getTime() - MARGEN_TOMA_MINUTOS * 60_000);
  let toma = proximaToma(p, desde);
  const administradas = new Set(
    administraciones.map((a) => tomaMasCercana(p, a)?.getTime()).filter((t) => t !== undefined),
  );
  while (toma && administradas.has(toma.getTime())) {
    toma = proximaToma(p, new Date(toma.getTime() + 1));
  }
  return toma;
}
