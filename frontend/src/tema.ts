import { createTheme } from '@mui/material';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';

/**
 * Diseño visual base (T009 · RNF01 · RNF02). Pensado para tablets usadas al lado de la cama,
 * muchas veces con guantes: objetivos táctiles grandes, letra legible y colores con contraste
 * AA o mejor sobre fondo claro. Ver docs/diseno-visual.md.
 */

/** Alto y ancho mínimo de todo control táctil, en píxeles. */
export const TAMANO_TACTIL_MINIMO = 56;

const RADIO = 12;

export const tema = createTheme({
  palette: {
    mode: 'light',
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
  shape: { borderRadius: RADIO },
  typography: {
    htmlFontSize: 16,
    fontSize: 15,
    fontFamily: '"Atkinson Hyperlegible", "Segoe UI", Roboto, Arial, sans-serif',
    h4: { fontWeight: 700, fontSize: '1.9rem' },
    h5: { fontWeight: 700, fontSize: '1.5rem' },
    h6: { fontWeight: 700 },
    body1: { fontSize: '1.0625rem' },
    button: { textTransform: 'none', fontWeight: 700, fontSize: '1.05rem' },
  },
  components: {
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
    MuiTab: {
      styleOverrides: { root: { minHeight: TAMANO_TACTIL_MINIMO, fontSize: '1rem' } },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true, variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { minHeight: TAMANO_TACTIL_MINIMO, backgroundColor: '#ffffff' },
        input: { fontSize: '1.0625rem' },
      },
    },
    MuiCheckbox: {
      styleOverrides: { root: { padding: 14 } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { fontSize: '1rem', paddingTop: 14, paddingBottom: 14 },
        head: { fontWeight: 700, backgroundColor: '#e8eff0' },
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
