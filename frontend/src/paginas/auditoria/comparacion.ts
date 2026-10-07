import { formatearFechaHora, formatearFechaSinZona } from '../../utilidades/formato';
import { nombreDeCampo } from './palabras';

/** Un campo guardado en la auditoría, con su valor antes y después de la acción. */
export interface FilaComparacion {
  clave: string;
  /** El nombre del campo en la interfaz. */
  campo: string;
  /** `undefined`: el campo no estaba de ese lado. */
  antes: unknown;
  despues: unknown;
  cambio: boolean;
}

type Valores = Record<string, unknown> | null;

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
 * campo cambió si los dos lados tienen valores y difieren (también si aparece o desaparece).
 * Sin valores anteriores (lo que se creó con la acción) no hay nada que marcar como cambiado.
 */
export function compararValores(antes: Valores, despues: Valores): FilaComparacion[] {
  const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])];
  const ambos = antes !== null && despues !== null;
  return claves.map((clave) => {
    const a = antes?.[clave];
    const d = despues?.[clave];
    return {
      clave,
      campo: nombreDeCampo(clave),
      antes: a,
      despues: d,
      cambio: ambos && !iguales(a, d),
    };
  });
}

const FECHA_Y_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const esCompuesto = (v: unknown) => v !== null && typeof v === 'object';

/**
 * Un valor simple como se lee: fechas en dd/mm/aaaa y horas de 24 h de Argentina, números con coma
 * decimal y sin separador de miles, "Sí"/"No". `[oculto]` (un dato sensible, D49) queda tal cual.
 * Un objeto o una lista de objetos no es un texto: devuelve null y se arma aparte.
 */
export function textoDeValor(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return 'Sin valor';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'number') {
    return valor.toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: 3 });
  }
  if (typeof valor === 'string') {
    if (FECHA_Y_HORA.test(valor) && !Number.isNaN(Date.parse(valor)))
      return formatearFechaHora(valor);
    if (FECHA.test(valor)) return formatearFechaSinZona(valor);
    return valor;
  }
  if (Array.isArray(valor)) {
    if (valor.some(esCompuesto)) return null;
    return valor.map((v) => textoDeValor(v)).join(', ');
  }
  return null;
}
