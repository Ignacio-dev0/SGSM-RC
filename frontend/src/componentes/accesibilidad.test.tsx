import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { simularFocoVisible } from '../pruebas/focoVisible';
import { CLAVE_TEMA, tema } from '../tema';
import { PlantillaTablet } from './PlantillaTablet';
import { SelectorTema } from './SelectorTema';

const OPCIONES = [
  { ruta: '/', etiqueta: 'Inicio' },
  { ruta: '/pacientes', etiqueta: 'Pacientes' },
];

function dibujarPlantilla() {
  return render(
    <ThemeProvider theme={tema}>
      <MemoryRouter initialEntries={['/pacientes']}>
        <PlantillaTablet opciones={OPCIONES} acciones={<button type="button">Acción</button>}>
          <p>Contenido de la pantalla</p>
        </PlantillaTablet>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

const enlaceSaltar = () => screen.getByRole('link', { name: 'Saltar al contenido' });

describe('saltar al contenido (WCAG 2.4.1)', () => {
  it('es lo primero que enfoca el teclado, antes del menú permanente', async () => {
    dibujarPlantilla();

    await userEvent.tab();

    expect(enlaceSaltar()).toHaveFocus();
  });

  it('al activarlo lleva el foco al contenido principal, que no entra en el tabulador', async () => {
    dibujarPlantilla();

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    const principal = screen.getByRole('main');
    expect(principal).toHaveFocus();
    expect(principal).toHaveAttribute('id', 'contenido');
    expect(principal).toHaveAttribute('tabindex', '-1');
    // No cambia la dirección: un salto de hash perdería el estado de navegación de la pantalla.
    expect(window.location.hash).toBe('');
  });

  it('también funciona con un toque o un clic', async () => {
    dibujarPlantilla();

    await userEvent.click(enlaceSaltar());

    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('el enlace apunta al contenido para quien lo recorre como lista de enlaces', () => {
    dibujarPlantilla();

    expect(enlaceSaltar()).toHaveAttribute('href', '#contenido');
  });

  it('queda fuera de la vista hasta recibir el foco', () => {
    dibujarPlantilla();
    const enlace = enlaceSaltar();

    expect(getComputedStyle(enlace).transform).toMatch(/^translateY\(-/);
    enlace.focus();
    expect(getComputedStyle(enlace).transform).toBe('none');
  });

  it('con el foco es táctil y usa los roles de la paleta, sin colores sueltos', () => {
    dibujarPlantilla();

    const estilo = getComputedStyle(enlaceSaltar());
    expect(estilo.minHeight).toBe('56px');
    expect(estilo.color).toBe('var(--mui-palette-text-primary)');
    expect(estilo.backgroundColor).toBe('var(--mui-palette-background-paper)');
  });

  it('el foco del contenido no dibuja un recuadro alrededor de toda la pantalla', () => {
    dibujarPlantilla();

    const css = [...document.querySelectorAll('style')].map((e) => e.textContent).join('');
    expect(css).toMatch(/:focus,\.css-[^{,]+:focus-visible\{outline:none/);
  });
});

describe('ayuda del botón de tema (UX-23 · tooltips)', () => {
  let restaurarFoco: () => void;
  beforeEach(() => {
    restaurarFoco = simularFocoVisible();
  });
  afterEach(() => restaurarFoco());

  function dibujarSelector() {
    return render(
      <ThemeProvider theme={tema} modeStorageKey={CLAVE_TEMA} defaultMode="dark">
        <SelectorTema />
      </ThemeProvider>,
    );
  }
  const boton = () => screen.getByRole('button', { name: /Tema de la pantalla/ });

  it('aparece con el foco del teclado y dice la acción y el estado actual', async () => {
    dibujarSelector();

    await userEvent.tab();

    expect(boton()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Cambiar el tema (ahora: Oscuro)');
  });

  it('aparece al pasar el puntero', async () => {
    dibujarSelector();

    await userEvent.hover(boton());

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Cambiar el tema');
  });

  it('es la descripción del botón y no reemplaza ni repite su nombre', async () => {
    dibujarSelector();

    await userEvent.tab();
    await screen.findByRole('tooltip');

    expect(boton()).toHaveAccessibleName('Tema de la pantalla: Oscuro');
    expect(boton()).toHaveAccessibleDescription('Cambiar el tema (ahora: Oscuro)');
  });

  it('se puede pasar el puntero sobre ella sin que se cierre', async () => {
    dibujarSelector();
    await userEvent.hover(boton());
    const ayuda = await screen.findByRole('tooltip');

    // Salir del botón y entrar a la ayuda es un solo gesto: sin pausa entre los dos eventos.
    fireEvent.mouseLeave(boton());
    fireEvent.mouseOver(ayuda);

    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('si el puntero se va sin pasar por ella, se cierra', async () => {
    dibujarSelector();
    await userEvent.hover(boton());
    await screen.findByRole('tooltip');

    await userEvent.unhover(boton());

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('se cierra con Escape sin mover el foco', async () => {
    dibujarSelector();
    await userEvent.tab();
    await screen.findByRole('tooltip');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(boton()).toHaveFocus();
  });

  it('no estorba al elegir: al abrir el menú del tema no queda ninguna ayuda encima', async () => {
    dibujarSelector();

    await userEvent.click(boton());

    expect(await screen.findByRole('menuitemradio', { name: 'Claro' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('en una pantalla táctil, un toque acciona el botón sin que aparezca la ayuda', async () => {
    dibujarSelector();

    fireEvent.touchStart(boton());
    fireEvent.touchEnd(boton());
    fireEvent.click(boton());

    expect(await screen.findByRole('menuitemradio', { name: 'Claro' })).toBeInTheDocument();
    // Más que la pulsación larga de MUI (700 ms): si no apareció, no va a aparecer.
    await new Promise((r) => setTimeout(r, 900));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('en una pantalla táctil, una pulsación larga la muestra', async () => {
    dibujarSelector();

    fireEvent.touchStart(boton());

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Cambiar el tema (ahora: Oscuro)');
  });
});
