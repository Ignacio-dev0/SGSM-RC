/**
 * Lector de los CSV del instalador (T803 · D103). Acepta lo que guardan Excel y los editores de
 * texto: UTF-8 con o sin BOM, separado por comas o por punto y coma (Excel en español), valores
 * entre comillas (RFC 4180) y fin de línea de Windows. Las filas se numeran como en la planilla:
 * el encabezado es la fila 1.
 */

export interface FilaCsv {
  /** Número de fila en la planilla (el encabezado es la 1). */
  numero: number;
  /** Valor de cada columna, sin espacios al principio ni al final. */
  valores: Record<string, string>;
}

export interface ColumnasCsv {
  obligatorias: readonly string[];
  opcionales?: readonly string[];
}

export interface TablaCsv {
  filas: FilaCsv[];
  /** Si hay alguno, `filas` viene vacía: el archivo no se usa. */
  errores: string[];
}

/** "Presentación " → "presentacion": el encabezado no distingue mayúsculas, tildes ni espacios. */
export const normalizarEncabezado = (texto: string) =>
  texto.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const NO_ES_UTF8 =
  'El archivo no está en UTF-8: en Excel, "Guardar como" → "CSV UTF-8 (delimitado por comas)"';

function decodificar(contenido: Buffer | string): string | null {
  if (typeof contenido === 'string') return contenido.replace(/^\uFEFF/, '');
  try {
    // ignoreBOM: false (por defecto) ya quita el BOM.
    return new TextDecoder('utf-8', { fatal: true }).decode(contenido);
  } catch {
    return null;
  }
}

/** El separador es el que más aparece en la primera línea (fuera de comillas). */
function separadorDe(texto: string): ',' | ';' {
  let comas = 0;
  let puntoYComa = 0;
  let entreComillas = false;
  for (const c of texto) {
    if (c === '"') entreComillas = !entreComillas;
    else if (!entreComillas && (c === '\n' || c === '\r')) break;
    else if (!entreComillas && c === ',') comas++;
    else if (!entreComillas && c === ';') puntoYComa++;
  }
  return puntoYComa > comas ? ';' : ',';
}

/** Parte el texto en registros y celdas; `sinCerrar` es la fila de una comilla que no se cerró. */
function registros(texto: string, sep: string): { celdas: string[][]; sinCerrar: number | null } {
  const celdas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  let filaDeLaComilla = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (entreComillas) {
      if (c !== '"') celda += c;
      else if (texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else entreComillas = false;
    } else if (c === '"') {
      entreComillas = true;
      filaDeLaComilla = celdas.length + 1;
    } else if (c === sep) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda);
      celdas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  if (entreComillas) return { celdas: [], sinCerrar: filaDeLaComilla };
  if (celda !== '' || fila.length > 0) {
    fila.push(celda);
    celdas.push(fila);
  }
  return { celdas, sinCerrar: null };
}

function revisarEncabezado(encabezado: string[], columnas: ColumnasCsv): string[] {
  const opcionales = columnas.opcionales ?? [];
  const validas = [...columnas.obligatorias, ...opcionales];
  const errores: string[] = [];
  const vistas = new Set<string>();
  for (const columna of encabezado) {
    if (vistas.has(columna)) errores.push(`Fila 1: la columna "${columna}" está dos veces`);
    else if (!validas.includes(columna)) {
      errores.push(
        `Fila 1: la columna "${columna}" no es de este archivo (se esperan: ${validas.join(', ')})`,
      );
    }
    vistas.add(columna);
  }
  for (const columna of columnas.obligatorias) {
    if (!vistas.has(columna)) errores.push(`Fila 1: falta la columna "${columna}"`);
  }
  return errores;
}

/** Lee el CSV y devuelve sus filas con las columnas pedidas, o los errores de formato. */
export function leerCsv(contenido: Buffer | string, columnas: ColumnasCsv): TablaCsv {
  const texto = decodificar(contenido);
  if (texto === null) return { filas: [], errores: [NO_ES_UTF8] };
  if (texto.trim() === '') return { filas: [], errores: ['El archivo está vacío'] };

  const { celdas, sinCerrar } = registros(texto, separadorDe(texto));
  if (sinCerrar !== null) {
    return { filas: [], errores: [`Fila ${sinCerrar}: hay una comilla sin cerrar`] };
  }
  const encabezado = (celdas[0] ?? []).map(normalizarEncabezado);
  const errores = revisarEncabezado(encabezado, columnas);
  if (errores.length > 0) return { filas: [], errores };

  const filas: FilaCsv[] = [];
  celdas.slice(1).forEach((registro, i) => {
    const numero = i + 2;
    const valores = registro.map((v) => v.trim());
    if (valores.every((v) => v === '')) return;
    if (valores.length > encabezado.length) {
      errores.push(
        `Fila ${numero}: tiene ${valores.length} valores y el encabezado tiene ${encabezado.length} columnas`,
      );
      return;
    }
    filas.push({
      numero,
      valores: Object.fromEntries(encabezado.map((columna, j) => [columna, valores[j] ?? ''])),
    });
  });
  if (errores.length > 0) return { filas: [], errores };
  if (filas.length === 0) return { filas: [], errores: ['El archivo no tiene filas con datos'] };
  return { filas, errores: [] };
}
