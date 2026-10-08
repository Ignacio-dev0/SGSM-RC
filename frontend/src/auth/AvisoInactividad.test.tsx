import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvisoInactividad } from './AvisoInactividad';

describe('aviso antes de cerrar la sesión por inactividad (T105)', () => {
  it('dice cuántos segundos faltan y permite seguir trabajando o salir', async () => {
    const alSeguir = vi.fn();
    const alSalir = vi.fn();
    render(<AvisoInactividad segundos={45} alSeguir={alSeguir} alSalir={alSalir} />);

    const aviso = screen.getByRole('alertdialog', { name: '¿Sigue ahí?' });
    expect(aviso).toHaveTextContent('Por seguridad, la sesión se cierra en 45 segundos');
    expect(within(aviso).getByRole('button', { name: 'Seguir trabajando' })).toHaveFocus();
    await userEvent.click(within(aviso).getByRole('button', { name: 'Seguir trabajando' }));
    expect(alSeguir).toHaveBeenCalled();
    await userEvent.click(within(aviso).getByRole('button', { name: 'Cerrar sesión' }));
    expect(alSalir).toHaveBeenCalled();
  });

  it('con un segundo, lo dice en singular', () => {
    render(<AvisoInactividad segundos={1} alSeguir={() => {}} alSalir={() => {}} />);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'se cierra en 1 segundo si no hay actividad',
    );
  });
});
