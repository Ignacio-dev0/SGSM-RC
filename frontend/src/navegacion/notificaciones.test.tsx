import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN } from '../pruebas/datos';
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
