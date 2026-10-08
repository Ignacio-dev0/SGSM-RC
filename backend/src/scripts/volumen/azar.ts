/**
 * Azar reproducible para el volumen (T702): en TypeScript, un generador con semilla (mulberry32,
 * el mismo de las semillas de biometría); en SQL, un hash del número de fila. Con la misma
 * semilla salen siempre los mismos datos.
 */
export class Azar {
  private estado: number;

  constructor(semilla: number) {
    this.estado = semilla >>> 0;
  }

  /** Número en [0, 1). */
  num(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  entre(min: number, max: number): number {
    return min + this.num() * (max - min);
  }

  /** Entero entre min y max, los dos incluidos. */
  entero(min: number, max: number): number {
    return Math.floor(this.entre(min, max + 1));
  }

  elegir<T>(lista: readonly T[]): T {
    const elegido = lista[Math.floor(this.num() * lista.length)];
    if (elegido === undefined) throw new Error('No se puede elegir de una lista vacía');
    return elegido;
  }

  /** Elige según el peso de cada opción. */
  ponderado<T>(opciones: readonly (readonly [T, number])[]): T {
    const total = opciones.reduce((s, [, peso]) => s + peso, 0);
    let r = this.num() * total;
    for (const [valor, peso] of opciones) {
      r -= peso;
      if (r < 0) return valor;
    }
    return opciones[opciones.length - 1]![0];
  }

  /** Mezcla la lista en el lugar (Fisher-Yates) y la devuelve. */
  mezclar<T>(lista: T[]): T[] {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(this.num() * (i + 1));
      [lista[i], lista[j]] = [lista[j]!, lista[i]!];
    }
    return lista;
  }
}

/** Pesos de Zipf: el primero es el más usado (unos pocos medicamentos se indican mucho más). */
export const pesosZipf = (n: number, s = 0.9) =>
  Array.from({ length: n }, (_, i) => 1 / (i + 1) ** s);

/**
 * Lo mismo en SQL: número en [0, 1) que depende solo de la expresión entera y de la sal (cada
 * decisión usa una sal distinta para que no se correlacionen).
 */
export const azarSql = (expresion: string, sal: number) =>
  `((hashint8extended((${expresion})::bigint, ${sal}) & 2147483647)::float8 / 2147483648.0)`;

/** Elemento de una lista de enteros elegido con `azarSql` (arreglo literal de PostgreSQL). */
export const elegirSql = (ids: readonly number[], expresion: string, sal: number) =>
  `(ARRAY[${ids.join(',')}])[1 + floor(${azarSql(expresion, sal)} * ${ids.length})::int]`;

/** Texto elegido de una lista (comillas escapadas). */
export const elegirTextoSql = (textos: readonly string[], expresion: string, sal: number) =>
  `(ARRAY[${textos.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')}])[1 + floor(${azarSql(expresion, sal)} * ${textos.length})::int]`;
