import {
  useColorScheme,
  useMediaQuery,
  useTheme,
  type CssVarsTheme,
  type Theme,
} from '@mui/material';

/** El tema con variables CSS trae la paleta de cada esquema (claro y oscuro). */
export type TemaConEsquemas = Theme & Pick<CssVarsTheme, 'colorSchemes'>;

/**
 * Colores de las series, tomados del tema activo (claro u oscuro): los gráficos pintan con
 * atributos SVG, así que se pasa el color ya resuelto y no la variable CSS. Nunca verde para
 * "bien" ni rojo para "mal": cada serie además se nombra con texto.
 */
export function useColoresGrafico() {
  const tema = useTheme<TemaConEsquemas>();
  const { mode, systemMode } = useColorScheme();
  const esquema = (mode === 'system' ? systemMode : mode) ?? 'light';
  const paleta = tema.colorSchemes[esquema]?.palette ?? tema.palette;
  return {
    primario: paleta.primary.main,
    secundario: paleta.secondary.main,
    aviso: paleta.warning.main,
    info: paleta.info.main,
  };
}

/** Sin animación de los gráficos si el dispositivo pide movimiento reducido (DESIGN.md · Calma). */
export const useSinAnimacion = () =>
  useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true });
