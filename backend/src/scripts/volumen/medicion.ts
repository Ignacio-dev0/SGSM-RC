/**
 * Piezas puras de la medición de rendimiento (T702 · RNF03): percentiles, la tabla en Markdown y
 * el bloque de docs/rendimiento.md que reescribe cada corrida.
 */

/** Lo que se usa al lado de la cama tiene que responder en medio segundo; el resto, en 2 s. */
export const LIMITE_CAMA_MS = 500;
export const LIMITE_GENERAL_MS = 2000;

export interface Resultado {
  grupo: string;
  operacion: string;
  limiteMs: number;
  /** Duraciones medidas en milisegundos (sin la vuelta de calentamiento). */
  tiempos: number[];
}

export interface Resumen {
  p50: number;
  p95: number;
  max: number;
}

/** Percentil por rango más cercano: con 20 muestras, el p95 es la 19.ª más rápida. */
export function percentil(valores: readonly number[], p: number): number {
  if (valores.length === 0) throw new Error('No hay valores para calcular el percentil');
  const ordenados = [...valores].sort((a, b) => a - b);
  const rango = Math.max(1, Math.ceil((p / 100) * ordenados.length));
  return ordenados[rango - 1]!;
}

export function resumir(tiempos: readonly number[]): Resumen {
  return { p50: percentil(tiempos, 50), p95: percentil(tiempos, 95), max: Math.max(...tiempos) };
}

/** Pasa el límite si el p95 está por debajo (una sola demora aislada no alcanza para fallar). */
export const cumple = (r: Resultado) => resumir(r.tiempos).p95 <= r.limiteMs;

const ms = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n))).replace('.', ',');

export function tablaMarkdown(resultados: readonly Resultado[]): string {
  const filas = resultados.map((r) => {
    const { p50, p95, max } = resumir(r.tiempos);
    return `| ${r.grupo} | ${r.operacion} | ${ms(r.limiteMs)} | ${ms(p50)} | ${ms(p95)} | ${ms(max)} | ${cumple(r) ? 'Cumple' : '**Excede**'} |`;
  });
  return [
    '| Grupo | Operación | Límite (ms) | p50 (ms) | p95 (ms) | Máx. (ms) | p95 ≤ límite |',
    '| ----- | --------- | ----------: | -------: | -------: | --------: | ------------ |',
    ...filas,
  ].join('\n');
}

const apertura = (etiqueta: string) => `<!-- medicion:${etiqueta} -->`;
const cierre = (etiqueta: string) => `<!-- /medicion:${etiqueta} -->`;

/** Filas (grupo y operación → límite y p95) de la tabla de un bloque, o null si no está. */
function filasDelBloque(documento: string, etiqueta: string) {
  const inicio = documento.indexOf(apertura(etiqueta));
  const fin = documento.indexOf(cierre(etiqueta));
  if (inicio < 0 || fin < inicio) return null;
  const numero = (celda: string) => Number(celda.replace(',', '.'));
  const filas = new Map<string, { limite: number; p95: number }>();
  for (const linea of documento.slice(inicio, fin).split('\n')) {
    const celdas = linea.split('|').map((c) => c.trim());
    // | grupo | operación | límite | p50 | p95 | máx | estado |
    if (celdas.length !== 9 || !/^\d/.test(celdas[3] ?? '')) continue;
    filas.set(`${celdas[1]} · ${celdas[2]}`, {
      limite: numero(celdas[3]!),
      p95: numero(celdas[5]!),
    });
  }
  return filas;
}

/** Tabla del p95 antes y después de los cambios, a partir de los bloques de las dos mediciones. */
export function compararMediciones(documento: string, antes = 'antes', despues = 'despues') {
  const a = filasDelBloque(documento, antes);
  const d = filasDelBloque(documento, despues);
  if (!a || !d) return null;
  const filas = [...d].flatMap(([operacion, { limite, p95 }]) => {
    const previo = a.get(operacion);
    if (!previo) return [];
    const cambio = Math.round(((p95 - previo.p95) / previo.p95) * 100);
    return [
      `| ${operacion} | ${ms(limite)} | ${ms(previo.p95)} | ${ms(p95)} | ${cambio > 0 ? '+' : cambio < 0 ? '−' : ''}${Math.abs(cambio)} % |`,
    ];
  });
  return [
    '| Operación | Límite (ms) | p95 antes (ms) | p95 después (ms) | Cambio |',
    '| --------- | ----------: | -------------: | ---------------: | -----: |',
    ...filas,
  ].join('\n');
}

/**
 * Reemplaza el bloque de la etiqueta en el documento (entre sus comentarios de apertura y
 * cierre); si no está, lo agrega al final con un título.
 */
export function reemplazarBloque(documento: string, etiqueta: string, contenido: string): string {
  const bloque = `${apertura(etiqueta)}\n\n${contenido.trim()}\n\n${cierre(etiqueta)}`;
  const inicio = documento.indexOf(apertura(etiqueta));
  const fin = documento.indexOf(cierre(etiqueta));
  if (inicio >= 0 && fin > inicio) {
    return documento.slice(0, inicio) + bloque + documento.slice(fin + cierre(etiqueta).length);
  }
  const base = documento.trimEnd();
  return `${base}${base ? '\n\n' : ''}## Medición: ${etiqueta}\n\n${bloque}\n`;
}
