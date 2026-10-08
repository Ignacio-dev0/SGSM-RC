/**
 * La agenda de una prescripción como la calcula el servidor (backend `prescripciones/agenda.ts`,
 * D112 · D121 · D122), para que la pantalla diga lo mismo que va a hacer el servidor: a qué toma
 * se atribuye una dosis y desde cuándo se cuentan las tomas al reanudar o cambiar la frecuencia.
 * La toma k es `agendaDesde + k × frecuencia` (k ≥ 0) mientras no pase la fecha de fin.
 */
import type { Prescripcion } from '../../api/tipos';

export type DatosAgenda = Pick<Prescripcion, 'fechaInicio' | 'frecuenciaHoras' | 'fechaFin'> &
  Partial<Pick<Prescripcion, 'agendaDesde'>>;

const HORA = 3_600_000;

const intervalo = (p: DatosAgenda) => p.frecuenciaHoras * HORA;
/** La toma 0: `agendaDesde`, o la fecha de inicio si el dato no vino. */
const ancla = (p: DatosAgenda) => Date.parse(p.agendaDesde ?? p.fechaInicio);
/** Si la agenda se volvió a anclar (se reanudó o cambió la frecuencia). */
export const reanclada = (p: DatosAgenda) => ancla(p) !== Date.parse(p.fechaInicio);
const dentroDelTratamiento = (p: DatosAgenda, toma: number) =>
  p.fechaFin === null || toma <= Date.parse(p.fechaFin);

/**
 * La toma (en milisegundos) a la que el servidor atribuye una dosis dada en `momento`: la más
 * cercana de la agenda vigente. En la agenda original, antes de media frecuencia del inicio no
 * hay toma (RN07); en una re-anclada, lo anterior al ancla es de su toma 0.
 */
export function tomaMasCercana(p: DatosAgenda, momento: Date): number | null {
  const f = intervalo(p);
  if (!reanclada(p) && momento.getTime() < ancla(p) - f / 2) return null;
  let k = Math.max(0, Math.round((momento.getTime() - ancla(p)) / f));
  while (k > 0 && !dentroDelTratamiento(p, ancla(p) + k * f)) k--;
  return ancla(p) + k * f;
}

/** Desde dónde se cuentan las tomas después de reanudar o de cambiar la frecuencia. */
export type AnclaNueva =
  { desde: 'ahora' } | { desde: 'inicio' } | { desde: 'dosis'; toma: string };

/** D112: al reanudar, desde ahora; si el tratamiento todavía no empezó, desde su inicio. */
export const anclaAlReanudar = (p: DatosAgenda, ahora: Date): AnclaNueva =>
  ahora.getTime() < Date.parse(p.fechaInicio) ? { desde: 'inicio' } : { desde: 'ahora' };

/**
 * D112 · D122: al cambiar la frecuencia, desde la toma de la última dosis dada en la agenda
 * vigente (las de antes de volver a anclar no cuentan). Si no hay, o si después de esa toma quedó
 * alguna sin dar hasta ahora, como al reanudar.
 */
export function anclaAlCambiarFrecuencia(
  p: DatosAgenda & Pick<Prescripcion, 'ultimasAdministraciones'>,
  ahora: Date,
): AnclaNueva {
  const tomas = p.ultimasAdministraciones
    .flatMap((a) => (a.tomaProgramada ? [Date.parse(a.tomaProgramada)] : []))
    .filter((t) => t >= ancla(p));
  if (tomas.length === 0) return anclaAlReanudar(p, ahora);
  const ultima = Math.max(...tomas);
  const siguiente = ultima + intervalo(p);
  const quedoSinDar = siguiente <= ahora.getTime() && dentroDelTratamiento(p, siguiente);
  return quedoSinDar
    ? anclaAlReanudar(p, ahora)
    : { desde: 'dosis', toma: new Date(ultima).toISOString() };
}
