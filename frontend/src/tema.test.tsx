import { Button, CssBaseline, IconButton, ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { TAMANO_TACTIL_MINIMO, tema } from './tema';

describe('tema visual', () => {
  it('define un tamaño táctil mínimo apto para usar con guantes (≥ 56 px)', () => {
    expect(TAMANO_TACTIL_MINIMO).toBeGreaterThanOrEqual(56);
  });

  it('aplica el tamaño táctil mínimo a botones y botones de ícono', () => {
    render(
      <ThemeProvider theme={tema}>
        <Button>Guardar</Button>
        <IconButton aria-label="Cerrar">x</IconButton>
      </ThemeProvider>,
    );

    for (const nombre of ['Guardar', 'Cerrar']) {
      const estilo = getComputedStyle(screen.getByRole('button', { name: nombre }));
      expect(estilo.minHeight).toBe(`${TAMANO_TACTIL_MINIMO}px`);
      expect(estilo.minWidth).toBe(`${TAMANO_TACTIL_MINIMO}px`);
    }
  });

  it('no usa mayúsculas en los botones y la letra base es de al menos 16 px', () => {
    expect(tema.typography.button.textTransform).toBe('none');
    expect(tema.typography.htmlFontSize).toBeGreaterThanOrEqual(16);
  });

  it('tiene tema oscuro para el turno noche', () => {
    const { colorSchemes } = tema as unknown as {
      colorSchemes: Record<'light' | 'dark', { palette: { background: { default: string } } }>;
    };
    expect(colorSchemes.dark).toBeDefined();
    expect(colorSchemes.dark.palette.background.default).not.toBe(
      colorSchemes.light.palette.background.default,
    );
  });

  it('desactiva animaciones si el dispositivo pide movimiento reducido y marca el foco', () => {
    render(
      <ThemeProvider theme={tema}>
        <CssBaseline />
      </ThemeProvider>,
    );
    const estilos = [...document.querySelectorAll('style')].map((e) => e.textContent).join('');
    expect(estilos).toMatch(/prefers-reduced-motion: ?reduce/);
    expect(estilos).toMatch(/Mui-focusVisible[^{]*\{[^}]*outline/);
  });
});
