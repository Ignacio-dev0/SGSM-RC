// Medidas de los gráficos que la biblioteca no calcula sola: el eje de los nombres y el lugar
// para el número al final de cada barra. Se estiman con el ancho medio de la letra de la app
// (Atkinson Hyperlegible es ancha: algo más de media letra por carácter), un poco por exceso.

/** Ancho medio de un carácter, en proporción al tamaño de la letra. */
const PROPORCION = 0.6;
/** Letra de los ejes y de las etiquetas de las barras (graficos.tsx). */
export const LETRA_EJES = 14;
/** Lo que ocupan la marca del eje y el espacio hasta el texto. */
export const RESGUARDO_EJE = 16;
/** Espacio entre el final de la barra y su número, y hasta el borde. */
const RESGUARDO_BARRA = 12;
/** Sin el ancho medido, lo que se estira el eje para el número de la barra más larga. */
const ESTIRAR_SIN_MEDIDA = 1.2;

/** Ancho aproximado de un texto en una línea, en píxeles. */
export const anchoDeTexto = (texto: string, tamano = LETRA_EJES) =>
  Math.ceil(texto.length * tamano * PROPORCION);

/**
 * Ancho del eje de los nombres (E6-03): el del renglón más largo, hasta la mitad del ancho del
 * gráfico. Sin el ancho medido, el del renglón.
 */
export function anchoDelEje(renglones: string[], anchoDelGrafico: number) {
  const necesario = Math.max(0, ...renglones.map((r) => anchoDeTexto(r))) + RESGUARDO_EJE;
  return anchoDelGrafico > 0 ? Math.min(necesario, Math.floor(anchoDelGrafico / 2)) : necesario;
}

/** Un renglón que no entra en `ancho` píxeles, cortado con "…". */
export function recortar(texto: string, ancho: number) {
  if (anchoDeTexto(texto) <= ancho) return texto;
  const letras = Math.max(1, Math.floor(ancho / (LETRA_EJES * PROPORCION)) - 1);
  return `${texto.slice(0, letras).trimEnd()}…`;
}

/** Lo que ocupa a la derecha de la barra la etiqueta más ancha, con su aire. */
const lugarPara = (etiquetas: string[]) =>
  Math.max(0, ...etiquetas.map((e) => anchoDeTexto(e))) + RESGUARDO_BARRA;

/** ¿Hay lugar para la barra más larga y su etiqueta? Hace falta el doble de la etiqueta. */
const entran = (etiquetas: string[], anchoDelArea: number) =>
  anchoDelArea > lugarPara(etiquetas) * 2;

/**
 * Las etiquetas largas ("31 (64,6 %)") si entran al lado de las barras; si no (en el teléfono),
 * las cortas ("31"): el resto queda en la tabla. Sin el ancho medido, las largas.
 */
export const etiquetasQueEntran = (largas: string[], cortas: string[], anchoDelArea: number) =>
  anchoDelArea === 0 || entran(largas, anchoDelArea) ? largas : cortas;

/**
 * El máximo del eje de los valores para que el número de la barra más larga entre a su derecha
 * (E6-17): la biblioteca recorta lo que sale del área de las barras, así que el lugar se hace
 * dentro del eje y no con el margen. `anchoDelArea` es el ancho de las barras (0 si no se midió).
 */
export function maximoConLugar(maximo: number, etiquetas: string[], anchoDelArea: number) {
  if (maximo <= 0) return undefined;
  // Un área que no alcanza ni para el número: se usa lo mismo que sin medir.
  if (!entran(etiquetas, anchoDelArea)) return Math.round(maximo * ESTIRAR_SIN_MEDIDA * 100) / 100;
  return (maximo * anchoDelArea) / (anchoDelArea - lugarPara(etiquetas));
}
