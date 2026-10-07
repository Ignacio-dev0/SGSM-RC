import { formatearFechaHora, formatearFechaSinZona } from '../../utilidades/formato';
import { nombreDeCampo, valorEnPalabras } from './palabras';

/** Un campo guardado en la auditoría, con su valor antes y después de la acción. */
export interface FilaComparacion {
  clave: string;
  /** El nombre del campo en la interfaz. */
  campo: string;
  /** `undefined`: el campo no estaba de ese lado. */
  antes: unknown;
  despues: unknown;
  cambio: boolean;
  /** Un dato sensible que el servidor no entrega (D49): se dice, no se muestra. */
  protegido: boolean;
}

type Valores = Record<string, unknown> | null;

/** Lo que entrega el servidor en lugar de un dato sensible (contraseña, rostro). */
export const OCULTO = '[oculto]';

/** Igualdad por contenido: las claves de un objeto pueden venir en otro orden. */
function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => iguales(x, b[i]));
  }
  const ca = Object.keys(a);
  const cb = Object.keys(b);
  return (
    ca.length === cb.length &&
    ca.every((k) => iguales((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

/**
 * Antes y después campo por campo, en el orden en que se guardaron (primero los de antes). Un
 * campo cambió si los dos lados tienen valores y difieren (también si aparece o desaparece). Un
 * dato protegido de los dos lados también cambió: el servidor solo guarda los campos que cambian,
 * aunque no muestre el valor. Sin valores anteriores (lo que se creó con la acción) no hay nada que
 * marcar como cambiado.
 */
export function compararValores(antes: Valores, despues: Valores): FilaComparacion[] {
  const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])];
  const ambos = antes !== null && despues !== null;
  return claves.map((clave) => {
    const a = antes?.[clave];
    const d = despues?.[clave];
    const protegido = a === OCULTO || d === OCULTO;
    return {
      clave,
      campo: nombreDeCampo(clave),
      antes: a,
      despues: d,
      cambio: ambos && (protegido ? clave in antes && clave in despues : !iguales(a, d)),
      protegido,
    };
  });
}

const FECHA_Y_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const esCompuesto = (v: unknown) => v !== null && typeof v === 'object';

/**
 * Un valor como se lee: con el campo, los códigos en palabras ("PENDIENTE" → "Pendiente", ids con
 * "n.º", E6-07); fechas en dd/mm/aaaa y horas de 24 h de Argentina, números con coma decimal y sin
 * separador de miles, "Sí"/"No". Un dato protegido (D49) se dice, no se muestra. Un objeto o una
 * lista de objetos no es un texto: devuelve null y se arma aparte.
 */
export function textoDeValor(valor: unknown, clave?: string): string | null {
  // Un campo que no estaba de ese lado no tiene valor, ni siquiera "todas las salas".
  if (valor === undefined) return 'Sin valor';
  const legible = clave ? valorEnPalabras(clave, valor) : valor;
  if (legible === null || legible === '') return 'Sin valor';
  if (legible === OCULTO) return 'Dato protegido (no se muestra)';
  if (typeof legible === 'boolean') return legible ? 'Sí' : 'No';
  if (typeof legible === 'number') {
    return legible.toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: 3 });
  }
  if (typeof legible === 'string') {
    if (FECHA_Y_HORA.test(legible) && !Number.isNaN(Date.parse(legible)))
      return formatearFechaHora(legible);
    if (FECHA.test(legible)) return formatearFechaSinZona(legible);
    return legible;
  }
  if (Array.isArray(legible)) {
    if (legible.some(esCompuesto)) return null;
    return legible.map((v) => textoDeValor(v)).join(', ');
  }
  return null;
}
