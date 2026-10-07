import { alpha, createTheme, type Theme } from '@mui/material';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';

/**
 * Diseño visual base (T009 · RNF01 · RNF02). Pensado para tablets usadas al lado de la cama,
 * muchas veces con guantes y de noche: objetivos táctiles grandes, letra legible, tema claro y
 * oscuro con contraste AA, foco visible y sin animaciones si el dispositivo pide movimiento
 * reducido. Ver DESIGN.md y docs/diseno-visual.md.
 */

/** Alto y ancho mínimo de todo control táctil, en píxeles. */
export const TAMANO_TACTIL_MINIMO = 56;

/** Dónde se recuerda en la tablet el tema elegido (sistema, claro u oscuro). */
export const CLAVE_TEMA = 'sgsm.tema';

const RADIO = 12;

/**
 * Tinte translúcido de un rol de la paleta, para fondos tenues (avisos, ítem activo). Con variables
 * CSS sigue al tema claro u oscuro sin recalcular.
 */
export function tinte(t: Theme, rol: 'primary' | 'warning', opacidad: number) {
  return t.vars
    ? `rgba(${t.vars.palette[rol].mainChannel} / ${opacidad})`
    : alpha(t.palette[rol].main, opacidad);
}

/** Consulta de pantallas por debajo de `sm` (teléfono): igual a `theme.breakpoints.down('sm')`. */
const BAJO_SM = '@media (max-width:599.95px)';

/**
 * Los indicadores de carga no se congelan con movimiento reducido: quietos, un círculo o una
 * barra no dejan distinguir "cargando" de "colgado" (UX-24).
 */
const SIN_INDICADORES_DE_CARGA =
  ':not(.MuiCircularProgress-root):not(.MuiCircularProgress-svg):not(.MuiCircularProgress-circle):not(.MuiLinearProgress-bar)';

export const tema = createTheme({
  // El tema activo se marca con <html data-tema="light|dark"> (ver index.html y SelectorTema).
  cssVariables: { colorSchemeSelector: 'data-tema' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#0b5d6b', dark: '#07434d', light: '#3d8794', contrastText: '#ffffff' },
        secondary: { main: '#5b3f8c', contrastText: '#ffffff' },
        error: { main: '#b3261e' },
        warning: { main: '#8a5300' },
        success: { main: '#1e6b3a' },
        info: { main: '#1f5a99' },
        background: { default: '#f3f6f7', paper: '#ffffff' },
        text: { primary: '#1a2326', secondary: '#4a5a5f' },
        divider: '#d5dee0',
      },
    },
    dark: {
      palette: {
        primary: { main: '#5fb8c6', dark: '#3d8794', light: '#8fd3de', contrastText: '#0b1f24' },
        secondary: { main: '#b39ddb', contrastText: '#1b1030' },
        error: { main: '#f2b8b5' },
        warning: { main: '#ffcc80' },
        success: { main: '#8fd19e' },
        info: { main: '#9ec5f0' },
        background: { default: '#0f1416', paper: '#182024' },
        text: { primary: '#e3e9eb', secondary: '#a9b7bb' },
        divider: '#2c393d',
      },
    },
  },
  shape: { borderRadius: RADIO },
  typography: {
    htmlFontSize: 16,
    fontSize: 15,
    fontFamily: '"Atkinson Hyperlegible", "Segoe UI", Roboto, Arial, sans-serif',
    // El título de pantalla baja a 1.5rem en teléfono para no ocupar dos líneas (F33).
    h4: { fontWeight: 700, fontSize: '1.9rem', [BAJO_SM]: { fontSize: '1.5rem' } },
    h5: { fontWeight: 700, fontSize: '1.5rem' },
    h6: { fontWeight: 700, lineHeight: 1.3 },
    body1: { fontSize: '1.0625rem' },
    button: { textTransform: 'none', fontWeight: 700, fontSize: '1.05rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        // Foco visible y grueso para quien usa teclado (los botones de MUI no traen contorno).
        '.Mui-focusVisible, a:focus-visible, [tabindex]:focus-visible': {
          outline: `3px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: 2,
        },
        '@media (prefers-reduced-motion: reduce)': {
          [`*${SIN_INDICADORES_DE_CARGA}, *${SIN_INDICADORES_DE_CARGA}::before, *${SIN_INDICADORES_DE_CARGA}::after`]:
            {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
        },
      }),
    },
    MuiButton: {
      defaultProps: { disableElevation: true, size: 'large' },
      styleOverrides: {
        root: {
          minHeight: TAMANO_TACTIL_MINIMO,
          minWidth: TAMANO_TACTIL_MINIMO,
          paddingLeft: 20,
          paddingRight: 20,
          borderRadius: RADIO,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { minHeight: TAMANO_TACTIL_MINIMO, minWidth: TAMANO_TACTIL_MINIMO },
      },
    },
    MuiListItemButton: {
      styleOverrides: { root: { minHeight: TAMANO_TACTIL_MINIMO } },
    },
    MuiMenuItem: {
      styleOverrides: { root: { minHeight: TAMANO_TACTIL_MINIMO } },
    },
    MuiTab: {
      styleOverrides: { root: { minHeight: TAMANO_TACTIL_MINIMO, fontSize: '1rem' } },
    },
    MuiTabs: {
      // En pantallas angostas las pestañas se deslizan en vez de quedar cortadas.
      defaultProps: {
        variant: 'scrollable',
        scrollButtons: 'auto',
        allowScrollButtonsMobile: true,
      },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true, variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: TAMANO_TACTIL_MINIMO,
          backgroundColor: theme.vars.palette.background.paper,
        }),
        input: { fontSize: '1.0625rem' },
      },
    },
    MuiCheckbox: {
      styleOverrides: { root: { padding: 14 } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { fontSize: '1rem', paddingTop: 14, paddingBottom: 14 },
        head: ({ theme }) => ({
          fontWeight: 700,
          backgroundColor: '#e8eff0',
          ...theme.applyStyles('dark', { backgroundColor: '#22303a' }),
        }),
      },
    },
    MuiAppBar: {
      defaultProps: { enableColorOnDark: true },
      styleOverrides: {
        // De día, la barra va en el color de la marca. De noche el cian brillante encandila:
        // pasa a la superficie del tema con texto normal y un borde sutil (F26).
        root: ({ theme }) =>
          theme.applyStyles('dark', {
            backgroundColor: theme.vars.palette.background.paper,
            color: theme.vars.palette.text.primary,
            borderBottom: `1px solid ${theme.vars.palette.divider}`,
          }),
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: RADIO + 4 } },
    },
    MuiAlert: {
      styleOverrides: { root: { fontSize: '1.0625rem', alignItems: 'center' } },
    },
  },
});
