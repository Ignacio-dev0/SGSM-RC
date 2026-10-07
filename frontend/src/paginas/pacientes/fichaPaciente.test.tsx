import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO } from '../../pruebas/datos';
import { HISTORIAL, paciente } from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(() => {
  servidor.use(
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
    http.get('*/api/pacientes/7/historial', () => HttpResponse.json({ data: HISTORIAL })),
  );
});

describe('pestañas de la ficha del paciente (WAI-ARIA tabs · UX-22)', () => {
  it('la lista de pestañas se anuncia con su nombre', async () => {
    renderizarApp('/pacientes/7?pestana=datos', ENFERMERO);

    const pestanas = await screen.findByRole('tablist', { name: 'Secciones de la ficha' });
    expect(
      within(pestanas)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Datos', 'Prescripciones', 'Historial']);
  });

  it('la pestaña seleccionada controla el panel visible, y el panel se nombra con ella', async () => {
    renderizarApp('/pacientes/7?pestana=datos', ENFERMERO);

    const pestana = await screen.findByRole('tab', { name: 'Datos' });
    expect(pestana).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Datos' });
    expect(pestana).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', pestana.id);
    expect(panel.id).not.toBe('');
    expect(pestana.id).not.toBe('');
    // El panel visible es el de los datos, no el de otra pestaña.
    expect(within(panel).getByText('Fecha de nacimiento')).toBeInTheDocument();
  });

  it('cada pestaña tiene su propio panel asociado', async () => {
    renderizarApp('/pacientes/7?pestana=datos', ENFERMERO);
    await screen.findByRole('tab', { name: 'Datos' });

    const asociados = screen.getAllByRole('tab').map((t) => t.getAttribute('aria-controls'));
    expect(asociados.every(Boolean)).toBe(true);
    expect(new Set(asociados).size).toBe(3);
    const ids = screen.getAllByRole('tab').map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('al cambiar de pestaña, el panel y su asociación cambian con ella', async () => {
    renderizarApp('/pacientes/7?pestana=datos', ENFERMERO);

    await userEvent.click(await screen.findByRole('tab', { name: 'Historial' }));

    const pestana = screen.getByRole('tab', { name: 'Historial' });
    expect(pestana).toHaveAttribute('aria-selected', 'true');
    const panel = await screen.findByRole('tabpanel', { name: 'Historial' });
    expect(pestana).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', pestana.id);
    // Solo existe el panel de la pestaña activa: no quedan paneles de otras secciones.
    expect(screen.queryByRole('tabpanel', { name: 'Datos' })).not.toBeInTheDocument();
  });

  it('abre en Prescripciones y su panel muestra esa sección', async () => {
    renderizarApp('/pacientes/7', ENFERMERO);

    const pestana = await screen.findByRole('tab', { name: 'Prescripciones' });
    const panel = await screen.findByRole('tabpanel', { name: 'Prescripciones' });
    expect(pestana).toHaveAttribute('aria-controls', panel.id);
  });
});
