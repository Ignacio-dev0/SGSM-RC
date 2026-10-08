import { AppBar, Button, CssBaseline, IconButton, ThemeProvider, Typography } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { TAMANO_TACTIL_MINIMO, tema } from './tema';

/** CSS generado hasta el momento por emotion, para revisar reglas que jsdom no resuelve. */
const estilosGenerados = () =>
  [...document.querySelectorAll('style')].map((e) => e.textContent).join('');

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
    const estilos = estilosGenerados();
    expect(estilos).toMatch(/prefers-reduced-motion: ?reduce/);
    expect(estilos).toMatch(/Mui-focusVisible[^{]*\{[^}]*outline/);
  });

  it('con movimiento reducido deja girar los indicadores de carga (UX-24)', () => {
    render(
      <ThemeProvider theme={tema}>
        <CssBaseline />
      </ThemeProvider>,
    );
    // Selector de la regla global que congela las animaciones.
    const regla =
      /@media \(prefers-reduced-motion: ?reduce\)\{([^{]*)\{[^}]*animation-duration/.exec(
        estilosGenerados(),
      );
    expect(regla).not.toBeNull();
    const selector = regla![1]!;
    // Sin esto el círculo y la barra quedan quietos y no se distingue "cargando" de "colgado".
    expect(selector).toContain(':not(');
    expect(selector).toContain('MuiCircularProgress');
    expect(selector).toContain('MuiLinearProgress');
  });
});

describe('barra superior según el tema (F26)', () => {
  const dibujar = (modo: 'light' | 'dark') =>
    render(
      <ThemeProvider theme={tema} defaultMode={modo}>
        <AppBar position="static" data-testid="barra">
          Barra
        </AppBar>
      </ThemeProvider>,
    );

  /** Declaraciones que la barra recibe solo bajo el selector del tema oscuro. */
  const reglasOscuras = () =>
    [...estilosGenerados().matchAll(/\[data-tema="dark"\][^{]*MuiAppBar-root\{([^}]*)\}/g)]
      .map((m) => m[1])
      .join(';');

  it('de noche no es la franja cian: usa la superficie, el texto del tema y un borde sutil', () => {
    dibujar('dark');
    expect(document.documentElement).toHaveAttribute('data-tema', 'dark');

    const estilo = getComputedStyle(screen.getByTestId('barra'));
    expect(estilo.backgroundColor).toBe('var(--mui-palette-background-paper)');
    expect(estilo.color).toBe('var(--mui-palette-text-primary)');
    // jsdom no interpreta el atajo con var(): se revisa la regla generada.
    expect(reglasOscuras()).toContain('border-bottom:1px solid var(--mui-palette-divider)');
  });

  it('de día conserva el color de la marca y no suma borde', () => {
    dibujar('light');
    expect(document.documentElement).toHaveAttribute('data-tema', 'light');

    const estilo = getComputedStyle(screen.getByTestId('barra'));
    expect(estilo.backgroundColor).toBe('var(--AppBar-background)');
    // Los colores de noche solo existen bajo el selector del tema oscuro: con tema claro no aplican.
    expect(reglasOscuras()).toContain('background-paper');
  });
});

describe('títulos (F33 · F34)', () => {
  it('el título h4 baja a 1.5rem por debajo de sm y sigue en 1.9rem en tablet', () => {
    const h4 = tema.typography.h4 as unknown as Record<string, unknown>;
    expect(h4.fontSize).toBe('1.9rem');
    expect(h4[tema.breakpoints.down('sm')]).toEqual({ fontSize: '1.5rem' });

    render(
      <ThemeProvider theme={tema}>
        <Typography variant="h4">Título</Typography>
      </ThemeProvider>,
    );
    expect(estilosGenerados()).toMatch(/@media \(max-width:599\.95px\)\{[^}]*font-size:1\.5rem/);
  });

  it('los títulos de tarjeta (h6) tienen interlineado ajustado a 1.3', () => {
    expect(tema.typography.h6.lineHeight).toBe(1.3);
  });
});
