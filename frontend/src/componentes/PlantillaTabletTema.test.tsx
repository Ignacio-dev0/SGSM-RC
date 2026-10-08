import { AppBar, ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { tema } from '../tema';
import { PlantillaTablet } from './PlantillaTablet';

/** CSS generado por emotion, para revisar reglas que jsdom no termina de resolver. */
const estilosGenerados = () =>
  [...document.querySelectorAll('style')].map((e) => e.textContent).join('');

const OPCIONES = [
  { ruta: '/', etiqueta: 'Inicio' },
  { ruta: '/pacientes', etiqueta: 'Pacientes' },
];

function dibujar(modo: 'light' | 'dark', aviso?: string) {
  return render(
    <ThemeProvider theme={tema} defaultMode={modo}>
      <MemoryRouter initialEntries={['/pacientes']}>
        <PlantillaTablet opciones={OPCIONES} {...(aviso ? { aviso } : {})}>
          <p>Contenido</p>
        </PlantillaTablet>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('ítem activo del menú según el tema (F26)', () => {
  const activo = () => screen.getAllByRole('link', { name: 'Pacientes' })[0]!;

  it('de día va relleno con el color de la marca', () => {
    dibujar('light');

    expect(activo()).toHaveClass('active');
    const estilo = getComputedStyle(activo());
    expect(estilo.backgroundColor).toBe('var(--mui-palette-primary-main)');
    // jsdom pasa a minúsculas el nombre de la variable.
    expect(estilo.color.toLowerCase()).toBe('var(--mui-palette-primary-contrasttext)');
  });

  it('de noche no encandila: tinte tenue de la marca con texto e ícono en primary.light', () => {
    dibujar('dark');

    expect(activo()).toHaveClass('active');
    expect(getComputedStyle(activo()).color).toBe('var(--mui-palette-primary-light)');
    // jsdom no interpreta rgba() con canales en variables: se revisa la regla generada.
    expect(estilosGenerados()).toMatch(
      /\[data-tema="dark"\][^{]*\.active\{[^}]*background-color:rgba\(var\(--mui-palette-primary-mainChannel\) \/ 0\.16\)/,
    );
  });
});

describe('franja de aviso fija bajo la barra superior (F27)', () => {
  it('no aparece si no hay aviso', () => {
    dibujar('light');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('queda fija bajo la barra, de borde a borde, sin radio y por debajo de ella', () => {
    render(
      <ThemeProvider theme={tema}>
        <MemoryRouter>
          <PlantillaTablet opciones={OPCIONES} aviso="Aviso de prueba">
            <p>Contenido</p>
          </PlantillaTablet>
          <AppBar position="fixed" data-testid="otra-barra" />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const franja = screen.getByRole('note');
    expect(franja).toHaveTextContent('Aviso de prueba');
    // Es hija directa del área de contenido, para quedar pegada mientras se desplaza.
    expect(franja.parentElement).toBe(screen.getByRole('main'));

    const estilo = getComputedStyle(franja);
    expect(estilo.position).toBe('sticky');
    expect(estilo.top).toBe('56px');
    expect(estilo.borderRadius).not.toMatch(/[1-9]/);
    // Debajo de la barra superior de la plantilla (zIndex del cajón + 1).
    expect(Number(estilo.zIndex)).toBeLessThan(tema.zIndex.drawer);

    // El mismo alto que la barra superior: 64 px desde `sm` y 48 px en teléfono apaisado.
    const css = estilosGenerados();
    expect(css).toMatch(/@media \(min-width:600px\)\{[^}]*\{[^}]*top:64px/);
    expect(css).toMatch(/@media \(orientation: landscape\)\{[^}]*\{[^}]*top:48px/);
  });

  it('usa un tono de advertencia tenue con los roles de la paleta, sin colores sueltos', () => {
    dibujar('light', 'Aviso de prueba');

    const estilo = getComputedStyle(screen.getByRole('note'));
    expect(estilo.color).toBe('var(--mui-palette-text-primary)');
    // Sobre una base opaca: si no, el contenido que se desplaza se transparenta bajo la franja.
    expect(estilo.backgroundColor).toBe('var(--mui-palette-background-default)');
    expect(estilosGenerados()).toMatch(
      /background-image:linear-gradient\(rgba\(var\(--mui-palette-warning-mainChannel\) \/ 0\.\d+\), rgba\(var\(--mui-palette-warning-mainChannel\) \/ 0\.\d+\)\)/,
    );
    expect(estilosGenerados()).toMatch(
      /border-bottom:1px solid;border-color:var\(--mui-palette-warning-main\)/,
    );
  });
});
