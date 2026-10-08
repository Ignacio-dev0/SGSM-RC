/**
 * Comparación de patrones faciales (T404 · CU10). El patrón es el vector de 128 valores que
 * genera face-api en la tablet. Dos rostros son de la misma persona cuando la distancia euclídea
 * entre sus patrones no supera el umbral (BIOMETRIA_UMBRAL, 0,5 por defecto; face-api sugiere
 * 0,6 — se usa uno más estricto porque un falso positivo deja registrado a otra persona).
 */

export const LARGO_PATRON = 128;

export function esPatronValido(patron: unknown): patron is number[] {
  return (
    Array.isArray(patron) &&
    patron.length === LARGO_PATRON &&
    patron.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

export function distanciaEuclidea(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('Los patrones tienen distinto largo');
  let suma = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    suma += d * d;
  }
  return Math.sqrt(suma);
}

export interface ResultadoComparacion {
  coincide: boolean;
  distancia: number;
  /** 1 / (1 + distancia): 1 es idéntico; sirve para mostrar y auditar, no para decidir. */
  similitud: number;
}

export function compararPatrones(
  guardado: readonly number[],
  capturado: readonly number[],
  umbral: number,
): ResultadoComparacion {
  const distancia = distanciaEuclidea(guardado, capturado);
  return { coincide: distancia <= umbral, distancia, similitud: 1 / (1 + distancia) };
}
