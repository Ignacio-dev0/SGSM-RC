import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN } from '../pruebas/datos';
import { simularFocoVisible } from '../pruebas/focoVisible';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';

describe('notificaciones (T112 · T407)', () => {
  it('lista los avisos, marca uno como leído y se cierra con Cerrar', async () => {
    const marcar = vi.fn(() => HttpResponse.json({ data: { id: 1, leida: true } }));
    renderizarApp('/', ADMIN);
    servidor.use(
      http.get('*/api/notificaciones', () =>
        HttpResponse.json({
          data: [
            {
              id: 1,
              tipo: 'CUENTA_BLOQUEADA',
              mensaje: 'Se bloqueó la cuenta de lgomez',
              leida: false,
              creadaEn: '2026-10-07T12:00:00.000Z',
            },
          ],
          meta: { noLeidas: 1 },
        }),
      ),
      http.patch('*/api/notificaciones/1/leida', marcar),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Notificaciones: 1 sin leer' }),
    );
    const dialogo = screen.getByRole('dialog', { name: 'Notificaciones' });
    expect(within(dialogo).getByText('Se bloqueó la cuenta de lgomez')).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Marcar leída' }));
    expect(marcar).toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('las leídas se distinguen con una etiqueta, sin bajar el contraste', async () => {
    renderizarApp('/', ADMIN);
    servidor.use(
      http.get('*/api/notificaciones', () =>
        HttpResponse.json({
          data: [
            {
              id: 2,
              tipo: 'CUENTA_BLOQUEADA',
              mensaje: 'Se bloqueó la cuenta de jperez',
              leida: true,
              creadaEn: '2026-10-07T10:00:00.000Z',
            },
          ],
          meta: { noLeidas: 0 },
        }),
      ),
    );

    await userEvent.click(await screen.findByRole('button', { name: /^Notificaciones/ }));
    const dialogo = screen.getByRole('dialog', { name: 'Notificaciones' });
    const item = (await within(dialogo).findByText('Se bloqueó la cuenta de jperez')).closest(
      'li',
    )!;
    expect(item).toHaveTextContent('Leída');
    expect(getComputedStyle(item).opacity).not.toBe('0.6');
  });

  it('si no se pueden cargar, lo dice en vez de "No hay notificaciones"', async () => {
    renderizarApp('/', ADMIN);
    servidor.use(
      http.get('*/api/notificaciones', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );

    await userEvent.click(await screen.findByRole('button', { name: /^Notificaciones/ }));
    const dialogo = screen.getByRole('dialog', { name: 'Notificaciones' });
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      /No se pudieron cargar las notificaciones/,
    );
    expect(within(dialogo).queryByText(/No hay notificaciones/)).not.toBeInTheDocument();
  });
});

describe('marcar todas como leídas (C3)', () => {
  /** Dos avisos que pasan a leídos cuando el servidor recibe "leer todas". */
  function simularDosAvisos({ leidas = false, falla = false } = {}) {
    const estado = { leidas };
    const marcarTodas = vi.fn(() => {
      if (falla) {
        return HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        );
      }
      estado.leidas = true;
      return HttpResponse.json({ data: { marcadas: 2 } });
    });
    servidor.use(
      http.get('*/api/notificaciones', () =>
        HttpResponse.json({
          data: [1, 2].map((id) => ({
            id,
            tipo: 'CUENTA_BLOQUEADA',
            mensaje: `Aviso ${id}`,
            leida: estado.leidas,
            creadaEn: '2026-10-07T12:00:00.000Z',
          })),
          meta: { noLeidas: estado.leidas ? 0 : 2 },
        }),
      ),
      http.post('*/api/notificaciones/leer-todas', marcarTodas),
    );
    return marcarTodas;
  }

  it('marca todas de una vez y la lista se actualiza', async () => {
    renderizarApp('/', ADMIN);
    const marcarTodas = simularDosAvisos();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Notificaciones: 2 sin leer' }),
    );
    const dialogo = screen.getByRole('dialog', { name: 'Notificaciones' });
    await userEvent.click(
      await within(dialogo).findByRole('button', { name: 'Marcar todas como leídas' }),
    );

    expect(marcarTodas).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(within(dialogo).queryAllByRole('button', { name: 'Marcar leída' })).toHaveLength(0),
    );
    expect(
      within(dialogo).queryByRole('button', { name: 'Marcar todas como leídas' }),
    ).not.toBeInTheDocument();
  });

  it('dice cuántas marcó y el foco no se pierde cuando el botón desaparece', async () => {
    renderizarApp('/', ADMIN);
    simularDosAvisos();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Notificaciones: 2 sin leer' }),
    );
    const dialogo = screen.getByRole('dialog', { name: 'Notificaciones' });
    await userEvent.click(
      await within(dialogo).findByRole('button', { name: 'Marcar todas como leídas' }),
    );

    // Con la cantidad que devolvió el servidor, anunciado sin interrumpir.
    expect(await within(dialogo).findByRole('status')).toHaveTextContent(
      'Se marcaron 2 como leídas.',
    );
    await waitFor(() =>
      expect(within(dialogo).getByRole('button', { name: 'Cerrar' })).toHaveFocus(),
    );
  });

  it('sin avisos sin leer no ofrece marcarlas', async () => {
    renderizarApp('/', ADMIN);
    simularDosAvisos({ leidas: true });

    await userEvent.click(await screen.findByRole('button', { name: /^Notificaciones/ }));
    const dialogo = screen.getByRole('dialog', { name: 'Notificaciones' });
    await within(dialogo).findByText('Aviso 1');
    expect(
      within(dialogo).queryByRole('button', { name: 'Marcar todas como leídas' }),
    ).not.toBeInTheDocument();
  });

  it('si falla, lo dice dentro del diálogo', async () => {
    renderizarApp('/', ADMIN);
    simularDosAvisos({ falla: true });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Notificaciones: 2 sin leer' }),
    );
    const dialogo = screen.getByRole('dialog', { name: 'Notificaciones' });
    await userEvent.click(
      await within(dialogo).findByRole('button', { name: 'Marcar todas como leídas' }),
    );
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      /No se pudieron marcar como leídas/,
    );
  });
});

describe('ayuda de la campana (UX-23 · tooltips)', () => {
  let restaurarFoco: () => void;
  beforeEach(() => {
    restaurarFoco = simularFocoVisible();
  });
  afterEach(() => restaurarFoco());

  const sinLeer = () =>
    http.get('*/api/notificaciones', () =>
      HttpResponse.json({
        data: [
          {
            id: 1,
            tipo: 'CUENTA_BLOQUEADA',
            mensaje: 'Se bloqueó la cuenta de lgomez',
            leida: false,
            creadaEn: '2026-10-07T12:00:00.000Z',
          },
        ],
        meta: { noLeidas: 1 },
      }),
    );

  /** Recorre la pantalla con Tab hasta llegar al control, como lo haría quien usa teclado. */
  async function tabularHasta(control: HTMLElement) {
    for (let i = 0; i < 30 && document.activeElement !== control; i++) await userEvent.tab();
    expect(control).toHaveFocus();
  }

  it('aparece con el foco del teclado y es la descripción, sin cambiar el nombre', async () => {
    renderizarApp('/', ADMIN);
    servidor.use(sinLeer());
    const campana = await screen.findByRole('button', { name: 'Notificaciones: 1 sin leer' });

    await tabularHasta(campana);

    expect(await screen.findByRole('tooltip', { name: 'Notificaciones' })).toBeInTheDocument();
    expect(campana).toHaveAccessibleName('Notificaciones: 1 sin leer');
    expect(campana).toHaveAccessibleDescription('Notificaciones');
  });

  it('se cierra con Escape sin mover el foco', async () => {
    renderizarApp('/', ADMIN);
    const campana = await screen.findByRole('button', { name: 'Notificaciones' });
    await tabularHasta(campana);
    await screen.findByRole('tooltip', { name: 'Notificaciones' });

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    expect(campana).toHaveFocus();
  });

  it('aparece al pasar el puntero', async () => {
    renderizarApp('/', ADMIN);

    await userEvent.hover(await screen.findByRole('button', { name: 'Notificaciones' }));

    expect(await screen.findByRole('tooltip', { name: 'Notificaciones' })).toBeInTheDocument();
  });
});
