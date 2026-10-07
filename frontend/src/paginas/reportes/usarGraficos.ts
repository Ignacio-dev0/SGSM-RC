import { useCallback, useRef, useState } from 'react';
import {
  useColorScheme,
  useMediaQuery,
  useTheme,
  type CssVarsTheme,
  type Theme,
} from '@mui/material';
import { LETRA_EJES } from './medidas';

/** El tema con variables CSS trae la paleta de cada esquema (claro y oscuro). */
export type TemaConEsquemas = Theme & Pick<CssVarsTheme, 'colorSchemes'>;

/**
 * Colores de las series por lo que significan, iguales en todos los gráficos de la pantalla
 * (E6-01 · DESIGN.md, Gráficos): un color quiere decir siempre lo mismo. Se toman del tema activo
 * (claro u oscuro) ya resueltos, porque los gráficos pintan con atributos SVG. Nunca verde para
 * "bien" ni rojo para "mal"; cada serie además se nombra con texto.
 */
export function useColoresGrafico() {
  const tema = useTheme<TemaConEsquemas>();
  const { mode, systemMode } = useColorScheme();
  const esquema = (mode === 'system' ? systemMode : mode) ?? 'light';
  const paleta = tema.colorSchemes[esquema]?.palette ?? tema.palette;
  return {
    /** Cantidades de suministros (todos): los más usados y la línea "Suministros". */
    suministros: paleta.info.main,
    /** Suministros con algún medicamento. */
    medicamentos: paleta.primary.main,
    /** Suministros con algún insumo. */
    insumos: paleta.secondary.main,
    /** Los recordatorios: neutro, porque lo normal no llama la vista. */
    recordatorios: paleta.text.secondary,
    /** Lo único que pide atención: los vencidos sin atender. */
    vencidos: paleta.warning.main,
  };
}

/** Sin animación de los gráficos si el dispositivo pide movimiento reducido (DESIGN.md · Calma). */
export const useSinAnimacion = () =>
  useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true });

/** Lo que tienen en común todos los gráficos: los colores, los textos y la animación. */
export function useComunes() {
  const telefono = useMediaQuery(useTheme().breakpoints.down('sm'), { noSsr: true });
  return {
    telefono,
    colores: useColoresGrafico(),
    props: {
      skipAnimation: useSinAnimacion(),
      localeText: { loading: 'Cargando…', noData: 'No hay datos en el período' },
    },
  };
}

/**
 * El ancho de un elemento, que sigue a la pantalla: para medir el eje de los nombres contra el
 * ancho del gráfico (E6-03). Es 0 hasta que se mide.
 */
export function useAncho() {
  const [ancho, setAncho] = useState(0);
  const observador = useRef<ResizeObserver | null>(null);
  const medir = useCallback((elemento: HTMLElement | null) => {
    observador.current?.disconnect();
    observador.current = null;
    if (!elemento) return;
    setAncho(elemento.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    observador.current = new ResizeObserver(([medida]) => {
      if (medida) setAncho(Math.round(medida.contentRect.width));
    });
    observador.current.observe(elemento);
  }, []);
  return [medir, ancho] as const;
}

/** Letra de los ejes legible a un brazo de distancia (la de la biblioteca es de 12 px). */
export const EJE = {
  tickLabelStyle: { fontSize: LETRA_EJES },
  labelStyle: { fontSize: 15 },
} as const;
/** El eje de abajo, con lugar para esa letra y el título (si no, la biblioteca oculta las marcas). */
export const EJE_X = { ...EJE, height: 56 } as const;

/** Leyendas y números de las barras con la letra de la app, no la de la biblioteca. */
export const LETRAS = {
  '& .MuiChartsLegend-label': { fontSize: '0.9375rem' },
  '& .MuiBarChart-label': { fontSize: LETRA_EJES },
} as const;
