import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, ENFERMERO } from '../pruebas/datos';
import { renderizarApp } from '../pruebas/renderizar';

describe('ruta desconocida (UX-22)', () => {
  it('con sesión, dice que no se encontró la pantalla en vez de llevar a Inicio en silencio', async () => {
    renderizarApp('/pantalla-que-no-existe', ENFERMERO);

    const titulo = await screen.findByRole('heading', {
      level: 1,
      name: 'No se encontró esta pantalla',
    });
    expect(titulo).toHaveFocus();
    expect(document.title).toBe('No se encontró esta pantalla · SGSM-RC');
    expect(screen.queryByText(/Hola, Sofía/)).not.toBeInTheDocument();
  });

  it('explica qué pasó y qué hacer', async () => {
    renderizarApp('/pacientes/7/algo/raro', ADMIN);

    await screen.findByRole('heading', { name: 'No se encontró esta pantalla' });
    expect(screen.getByRole('main')).toHaveTextContent(/no corresponde a ninguna pantalla/);
  });

  it('se muestra dentro de la disposición, con el menú a mano', async () => {
    renderizarApp('/pantalla-que-no-existe', ENFERMERO);

    await screen.findByRole('heading', { name: 'No se encontró esta pantalla' });
    const menu = screen.getByRole('navigation', { name: 'Menú principal' });
    expect(within(menu).getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('"Ir al inicio" lleva a Inicio', async () => {
    renderizarApp('/pantalla-que-no-existe', ENFERMERO);

    await userEvent.click(await screen.findByRole('link', { name: 'Ir al inicio' }));

    expect(await screen.findByRole('heading', { name: /Hola, Sofía/ })).toBeInTheDocument();
  });

  it('sin sesión, sigue llevando al ingreso', async () => {
    renderizarApp('/pantalla-que-no-existe', null);

    expect(await screen.findByRole('heading', { name: /Ingresar/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'No se encontró esta pantalla' }),
    ).not.toBeInTheDocument();
  });
});
