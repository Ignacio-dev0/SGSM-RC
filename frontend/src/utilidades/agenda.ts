/**
 * Vista previa de los horarios de una prescripción mientras se carga (T304). Usa la misma regla
 * que el backend (backend/src/modulos/prescripciones/agenda.ts): la toma k es inicio + k × frecuencia.
 */
export function proximasTomas(
  inicio: string,
  frecuenciaHoras: number,
  fin: string | null,
  cantidad: number,
): Date[] {
  const desde = new Date(inicio).getTime();
  if (!inicio || Number.isNaN(desde) || !(frecuenciaHoras >= 1)) return [];
  const hasta = fin ? new Date(fin).getTime() : Infinity;
  const tomas: Date[] = [];
  for (let k = 0; tomas.length < cantidad; k++) {
    const t = desde + k * frecuenciaHoras * 3_600_000;
    if (t > hasta) break;
    tomas.push(new Date(t));
  }
  return tomas;
}
