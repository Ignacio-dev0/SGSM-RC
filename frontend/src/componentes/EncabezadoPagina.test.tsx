import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { simularFocoVisible } from '../pruebas/focoVisible';
import { tema } from '../tema';
import { EncabezadoPagina } from './EncabezadoPagina';

/** CSS generado por emotion, para revisar reglas que jsdom no termina de resolver. */
const estilosGenerados = () =>
  [...document.querySelectorAll('style')].map((e) => e.textContent).join('');

function envolver(ui: React.ReactNode) {
  return (
    <ThemeProvider theme={tema}>
      <MemoryRouter>{ui}</MemoryRouter>
    </ThemeProvider>
  );
}

const titulo = () => screen.getByRole('heading', { level: 1 });

describe('encabezado de pantalla en teléfono (F33)', () => {
  it('la flecha y el título comparten la fila, y la flecha se alinea al borde', () => {
    render(envolver(<EncabezadoPagina titulo="Administrar medicamento" volverA="/" />));

    const flecha = screen.getByRole('link', { name: 'Volver' });
    expect(flecha).toHaveClass('MuiIconButton-edgeStart');
    const cajaTitulo = titulo().parentElement!;
    expect(cajaTitulo.parentElement).toBe(flecha.parentElement);
  });

  it('el título ocupa el resto de la fila y puede achicarse para no empujar a la flecha', () => {
    render(envolver(<EncabezadoPagina titulo="Administrar medicamento" volverA="/" />));

    // flex: 1 1 0 (ocupa el resto sin pedir ancho propio) y min-width 0 en teléfono; desde tablet
    // conserva 200 px para que las acciones no lo aplasten.
    const css = estilosGenerados();
    expect(css).toMatch(/flex:1 1 0;/);
    expect(css).toMatch(/@media \(min-width:0px\)\{[^}]*min-width:0;/);
    expect(css).toMatch(/@media \(min-width:600px\)\{[^}]*min-width:200px/);
  });

  it('en teléfono las acciones pasan a su propia fila; desde tablet quedan a la derecha', () => {
    render(
      envolver(
        <EncabezadoPagina titulo="Pacientes" acciones={<button type="button">Nuevo</button>} />,
      ),
    );

    const acciones = screen.getByRole('button', { name: 'Nuevo' }).parentElement!;
    expect(acciones.parentElement).toBe(titulo().parentElement!.parentElement);
    const css = estilosGenerados();
    expect(css).toMatch(/@media \(min-width:0px\)\{[^}]*flex-basis:100%/);
    expect(css).toMatch(/@media \(min-width:600px\)\{[^}]*flex-basis:auto/);
  });

  it('sin flecha ni acciones muestra solo el título y el subtítulo', () => {
    render(envolver(<EncabezadoPagina titulo="Pacientes" subtitulo="12 internados" />));

    expect(titulo()).toHaveTextContent('Pacientes');
    expect(screen.getByText('12 internados')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Volver' })).not.toBeInTheDocument();
  });
});

describe('título del documento y foco al cambiar de pantalla (UX-14 · WCAG 2.4.2)', () => {
  const tituloOriginal = document.title;
  afterEach(() => {
    document.title = tituloOriginal;
  });

  it('pone el título de la pantalla en el título del documento', () => {
    const { rerender } = render(envolver(<EncabezadoPagina titulo="Pacientes" />));
    expect(document.title).toBe('Pacientes · SGSM-RC');

    rerender(envolver(<EncabezadoPagina titulo="Nuevo paciente" />));
    expect(document.title).toBe('Nuevo paciente · SGSM-RC');
  });

  it('al salir de la pantalla devuelve el título que había', () => {
    document.title = 'SGSM-RC · Hospital El Dique';
    const { unmount } = render(envolver(<EncabezadoPagina titulo="Pacientes" />));
    expect(document.title).toBe('Pacientes · SGSM-RC');

    unmount();
    expect(document.title).toBe('SGSM-RC · Hospital El Dique');
  });

  it('lleva el foco al título, que no entra en el orden del tabulador', () => {
    render(envolver(<EncabezadoPagina titulo="Pacientes" />));

    expect(titulo()).toHaveFocus();
    expect(titulo()).toHaveAttribute('tabindex', '-1');
  });

  it('vuelve a llevar el foco al título cuando cambia', () => {
    const { rerender } = render(
      envolver(
        <>
          <EncabezadoPagina titulo="Pacientes" />
          <button type="button">Otro</button>
        </>,
      ),
    );
    screen.getByRole('button', { name: 'Otro' }).focus();

    rerender(
      envolver(
        <>
          <EncabezadoPagina titulo="Nuevo paciente" />
          <button type="button">Otro</button>
        </>,
      ),
    );
    expect(titulo()).toHaveFocus();
  });

  it('respeta un campo del contenido que ya tomó el foco por sí mismo', () => {
    render(
      envolver(
        <main>
          <input aria-label="Buscar" autoFocus />
          <EncabezadoPagina titulo="Pacientes" />
        </main>,
      ),
    );

    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveFocus();
    expect(document.title).toBe('Pacientes · SGSM-RC');
  });

  it('el foco por programa no dibuja un recuadro alrededor del título (no es un control)', () => {
    render(envolver(<EncabezadoPagina titulo="Pacientes" />));

    expect(estilosGenerados()).toMatch(/:focus,\.css-[^{,]+:focus-visible\{outline:none/);
  });
});

describe('ayuda de la flecha para volver (UX-23 · tooltips)', () => {
  let restaurarFoco: () => void;
  beforeEach(() => {
    restaurarFoco = simularFocoVisible();
  });
  afterEach(() => restaurarFoco());

  const flecha = () => screen.getByRole('link', { name: 'Volver' });

  it('aparece con el foco del teclado y es la descripción del enlace, no su nombre', async () => {
    render(envolver(<EncabezadoPagina titulo="Nuevo paciente" volverA="/pacientes" />));
    // Al abrirse la pantalla el foco va al título, que está después de la flecha: Mayús+Tab llega a ella.
    await userEvent.tab({ shift: true });

    expect(flecha()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Volver a Pacientes');
    expect(flecha()).toHaveAccessibleName('Volver');
    expect(flecha()).toHaveAccessibleDescription('Volver a Pacientes');
  });

  it('se cierra con Escape sin mover el foco', async () => {
    render(envolver(<EncabezadoPagina titulo="Nuevo paciente" volverA="/pacientes" />));
    await userEvent.tab({ shift: true });
    await screen.findByRole('tooltip');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(flecha()).toHaveFocus();
  });

  it('aparece al pasar el puntero', async () => {
    render(envolver(<EncabezadoPagina titulo="Nuevo paciente" volverA="/pacientes" />));

    await userEvent.hover(flecha());

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Volver a Pacientes');
  });

  it.each([
    ['/', 'Volver al inicio'],
    ['/pacientes', 'Volver a Pacientes'],
    // La búsqueda conserva sus filtros en la dirección: igual se vuelve a la lista.
    ['/pacientes?texto=beni&estado=INTERNADO', 'Volver a Pacientes'],
    ['/pacientes/7', 'Volver a la ficha del paciente'],
    ['/pacientes/7?pestana=prescripciones', 'Volver a la ficha del paciente'],
    ['/suministros', 'Volver a Suministros'],
    ['/biometria', 'Volver a Biometría'],
    ['/usuarios', 'Volver a Usuarios'],
    ['/usuarios/3', 'Volver al usuario'],
    // Un destino que no se reconoce no inventa un nombre.
    ['/otra/cosa', 'Volver'],
  ])('si vuelve a %s dice "%s"', async (destino, texto) => {
    render(envolver(<EncabezadoPagina titulo="Pantalla" volverA={destino} />));

    await userEvent.hover(flecha());

    expect(await screen.findByRole('tooltip')).toHaveTextContent(new RegExp(`^${texto}$`));
  });
});
