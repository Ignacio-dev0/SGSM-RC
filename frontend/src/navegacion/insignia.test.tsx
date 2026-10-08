import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UsuarioSesion } from '../api/tipos';
import { ENFERMERO, MEDICO } from '../pruebas/datos';
import {
  RECORDATORIOS,
  aLos,
  fijarHoraTablet,
  recordatorio,
  recordatorioDeEstudio,
  simularRecordatorios,
} from '../pruebas/datosRecordatorios';
import { renderizarApp } from '../pruebas/renderizar';

describe('insignia de recordatorios en la barra (T506)', () => {
  it('dice cuántos hay para atender y cuántos son urgentes, y lleva a la lista', async () => {
    simularRecordatorios(RECORDATORIOS);
    renderizarApp('/', ENFERMERO);

    const insignia = await screen.findByRole('link', {
      name: 'Recordatorios: 4 para atender, 2 urgentes',
    });
    expect(insignia).toHaveTextContent('4');

    await userEvent.click(insignia);
    expect(
      await screen.findByRole('heading', { name: 'Recordatorios', level: 1 }),
    ).toBeInTheDocument();
  });

  it('con un solo urgente lo dice en singular', async () => {
    simularRecordatorios([
      recordatorio(),
      recordatorio({ id: 13, prioridad: 'BAJA', fechaHoraObjetivo: aLos(25) }),
    ]);
    renderizarApp('/', MEDICO);

    expect(
      await screen.findByRole('link', { name: 'Recordatorios: 2 para atender, 1 urgente' }),
    ).toBeInTheDocument();
  });

  it('la cantidad va rellena de advertencia solo si hay urgentes', async () => {
    // Una toma de prioridad baja falta más de 15 min (S10).
    simularRecordatorios([recordatorio({ prioridad: 'BAJA', fechaHoraObjetivo: aLos(25) })]);
    renderizarApp('/', ENFERMERO);

    const insignia = await screen.findByRole('link', {
      name: 'Recordatorios: 1 para atender, 0 urgentes',
    });
    const cantidad = insignia.querySelector('.MuiBadge-badge')!;
    expect(cantidad).toHaveTextContent('1');
    expect(cantidad).not.toHaveClass('MuiBadge-colorWarning');
  });

  it('con urgentes, la cantidad va en color de advertencia', async () => {
    simularRecordatorios([recordatorio()]);
    renderizarApp('/', ENFERMERO);

    const insignia = await screen.findByRole('link', {
      name: 'Recordatorios: 1 para atender, 1 urgente',
    });
    expect(insignia.querySelector('.MuiBadge-badge')).toHaveClass('MuiBadge-colorWarning');
  });

  it('cuenta como urgente lo atrasado aunque el servidor no lo cuente (un estudio pasado su hora, E5-02)', async () => {
    fijarHoraTablet();
    // El servidor deja el estudio en MEDIA: meta.urgentes = 0.
    simularRecordatorios([recordatorioDeEstudio({ fechaHoraObjetivo: aLos(-10) })]);
    renderizarApp('/', ENFERMERO);

    const insignia = await screen.findByRole('link', {
      name: 'Recordatorios: 1 para atender, 1 urgente',
    });
    expect(insignia.querySelector('.MuiBadge-badge')).toHaveClass('MuiBadge-colorWarning');
    vi.useRealTimers();
  });

  it('sin recordatorios.ver no aparece', async () => {
    const sinRecordatorios: UsuarioSesion = {
      ...ENFERMERO,
      permisos: ENFERMERO.permisos.filter((p) => !p.startsWith('recordatorios.')),
    };
    renderizarApp('/', sinRecordatorios);

    await screen.findByRole('heading', { name: /Hola, Sofía/ });
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /^Recordatorios/ })).not.toBeInTheDocument(),
    );
  });
});
