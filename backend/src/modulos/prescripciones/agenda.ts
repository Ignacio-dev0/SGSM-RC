/**
 * Cálculo de horarios de administración (T302 · CU17 · RF07). Funciones puras: a partir del ancla
 * de la agenda (`agendaDesde`) y la frecuencia en horas, la toma k es `agendaDesde + k ×
 * frecuencia` (k ≥ 0), mientras no pase la fecha de fin del tratamiento. Los recordatorios (E5)
 * y el registro de administraciones (E4) se apoyan en esta misma agenda.
 *
 * D112 · D122: el ancla es la fecha de inicio hasta que la prescripción se reanuda (ancla = ese
 * momento) o cambia de frecuencia (ancla = la toma de la última dosis dada, o ese momento si no
 * hay o si después quedó alguna toma sin dar). D121: cada administración guarda su toma al
 * registrarse; "qué tomas ya se dieron" sale de esas tomas guardadas, no de recalcularlas.
 */

export interface DatosAgenda {
  fechaInicio: Date;
  /** Toma 0 de la agenda vigente: la fecha de inicio salvo que se haya vuelto a anclar (D112). */
  agendaDesde: Date;
  frecuenciaHoras: number;
  fechaFin: Date | null;
}

const HORA = 3_600_000;
/** Tope de seguridad para no generar listas enormes por un rango mal pedido. */
const MAXIMO_DE_TOMAS = 500;

const intervalo = (p: DatosAgenda) => p.frecuenciaHoras * HORA;
const ancla = (p: DatosAgenda) => p.agendaDesde.getTime();
const reanclada = (p: DatosAgenda) => ancla(p) !== p.fechaInicio.getTime();
const tomaN = (p: DatosAgenda, k: number) => new Date(ancla(p) + k * intervalo(p));
const dentroDelTratamiento = (p: DatosAgenda, toma: Date) =>
  p.fechaFin === null || toma.getTime() <= p.fechaFin.getTime();

/** Tomas programadas dentro de [desde, hasta], ambos incluidos. */
export function tomasEntre(p: DatosAgenda, desde: Date, hasta: Date): Date[] {
  if (hasta < desde) return [];
  const desdeAncla = desde.getTime() - ancla(p);
  let k = Math.max(0, Math.ceil(desdeAncla / intervalo(p)));
  const tomas: Date[] = [];
  for (let t = tomaN(p, k); t <= hasta && tomas.length < MAXIMO_DE_TOMAS; t = tomaN(p, ++k)) {
    if (!dentroDelTratamiento(p, t)) break;
    tomas.push(t);
  }
  return tomas;
}

/** Si `fecha` es una de las tomas de la agenda vigente. */
export function esTomaDeLaAgenda(p: DatosAgenda, fecha: Date): boolean {
  const desdeAncla = fecha.getTime() - ancla(p);
  return desdeAncla >= 0 && desdeAncla % intervalo(p) === 0 && dentroDelTratamiento(p, fecha);
}

/** Próxima toma a partir de `ahora` (incluida la que corresponde justo ahora), o null. */
export function proximaToma(p: DatosAgenda & { estado: string }, ahora: Date): Date | null {
  if (p.estado !== 'VIGENTE') return null;
  const desdeAncla = ahora.getTime() - ancla(p);
  const toma = tomaN(p, Math.max(0, Math.ceil(desdeAncla / intervalo(p))));
  return dentroDelTratamiento(p, toma) ? toma : null;
}

/**
 * Toma programada a la que corresponde una administración hecha en `momento`: la más cercana de
 * la agenda vigente. Se calcula al registrarla y queda guardada (D121). En la agenda original, la
 * primera toma se puede adelantar hasta media frecuencia (RN07) y antes de eso no hay toma (el
 * tratamiento no empezó); en una re-anclada, lo anterior al ancla es de su toma 0.
 */
export function tomaMasCercana(p: DatosAgenda, momento: Date): Date | null {
  if (!reanclada(p) && momento.getTime() < ancla(p) - intervalo(p) / 2) return null;
  const desdeAncla = momento.getTime() - ancla(p);
  let k = Math.max(0, Math.round(desdeAncla / intervalo(p)));
  while (k > 0 && !dentroDelTratamiento(p, tomaN(p, k))) k--;
  return tomaN(p, k);
}

/**
 * D112 · D122: ancla de la agenda cuando cambia la frecuencia. Es la toma de la última dosis dada
 * en la agenda vigente: pasa a ser la toma 0 de la nueva, ya dada, y la próxima se cuenta desde
 * ahí. Si no hay dosis, o si después de esa toma quedó alguna sin dar hasta ahora, el ancla es
 * ahora: lo atrasado se da ya y no se atribuye a una toma futura de la agenda nueva.
 */
export function anclaPorCambioDeFrecuencia(
  p: DatosAgenda,
  ahora: Date,
  ultimaTomaDada: Date | null,
): Date {
  if (!ultimaTomaDada) return anclaAlReanudar(p, ahora);
  const sinDar = tomasEntre(p, new Date(ultimaTomaDada.getTime() + 1), ahora);
  return sinDar.length > 0 ? anclaAlReanudar(p, ahora) : ultimaTomaDada;
}

/**
 * D112: ancla de la agenda al reanudar: `ahora` (la próxima toma es ya). Si el tratamiento
 * todavía no empezó, se queda en la fecha de inicio: reanudar no lo adelanta.
 */
export function anclaAlReanudar(p: DatosAgenda, ahora: Date): Date {
  return ahora < p.fechaInicio ? p.fechaInicio : ahora;
}

/** Minutos durante los que una toma no administrada se sigue mostrando como la próxima. */
export const MARGEN_TOMA_MINUTOS = 30;

/**
 * Próxima toma que falta dar: como `proximaToma`, pero una toma de los últimos
 * MARGEN_TOMA_MINUTOS que todavía no se administró sigue siendo la próxima, y una que ya se
 * administró se saltea. `dadas` son las tomas guardadas de las administraciones (D121). Las
 * tomas atrasadas por más tiempo las sigue el módulo de recordatorios.
 */
export function proximaTomaPendiente(
  p: DatosAgenda & { estado: string },
  ahora: Date,
  dadas: (Date | null)[],
): Date | null {
  const desde = new Date(ahora.getTime() - MARGEN_TOMA_MINUTOS * 60_000);
  let toma = proximaToma(p, desde);
  const administradas = tomasDadas(dadas);
  while (toma && administradas.has(toma.getTime())) {
    toma = proximaToma(p, new Date(toma.getTime() + 1));
  }
  return toma;
}

/** Las tomas (en milisegundos) que ya tienen una administración, por la toma que guardó (D121). */
export function tomasDadas(dadas: (Date | null)[]): Set<number> {
  return new Set(dadas.flatMap((toma) => (toma ? [toma.getTime()] : [])));
}
