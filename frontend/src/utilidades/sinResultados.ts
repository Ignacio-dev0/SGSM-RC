// Mensajes de los listados sin resultados: qué no se encontró y qué probar.

/** Una parte de un mensaje; las que no corresponden vienen vacías, en falso o sin definir. */
type Parte = string | false | undefined;

const presentes = (partes: Parte[]) => partes.filter((p): p is string => Boolean(p));

/** "No hay" + "pacientes internados" + … → "No hay pacientes internados …." */
export function oracionDe(partes: Parte[]): string {
  return `${presentes(partes).join(' ')}.`;
}

/**
 * El paso siguiente de un listado sin resultados, a partir de lo que se puede cambiar:
 * `['pruebe con otro apellido, DNI o cama', 'cambie Estado a Todos']` →
 * "Pruebe con otro apellido, DNI o cama, o cambie Estado a Todos."
 */
export function pasosParaProbar(candidatos: Parte[]): string {
  const pasos = presentes(candidatos);
  const ultimo = pasos.at(-1);
  if (ultimo === undefined) return '';
  const frase = pasos.length === 1 ? ultimo : `${pasos.slice(0, -1).join(', ')}, o ${ultimo}`;
  return `${frase.charAt(0).toUpperCase()}${frase.slice(1)}.`;
}
