import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import { paciente } from '../../pruebas/datosPacientes';
import {
  prepararPrescripciones,
  restaurarPruebas,
  errorDelServidor,
  prescripcion,
} from '../../pruebas/datosPrescripciones';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(prepararPrescripciones);
afterEach(restaurarPruebas);

describe('modificación de prescripción (T306 · CU19)', () => {
  it('cambia la dosis pidiendo el motivo', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.patch('*/api/prescripciones/40', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: prescripcion({ dosis: 1000 }) });
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const dialogo = screen.getByRole('dialog', { name: /Guardar cambios/ });
    await userEvent.type(within(dialogo).getByLabelText(/Motivo del cambio/), 'Dolor persistente');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/guardaron/);
    expect(enviado).toMatchObject({ dosis: 1000, motivo: 'Dolor persistente' });
  });

  it('si la prescripción no se puede cargar lo dice y deja reintentar', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/prescripciones/40', () =>
        fallar
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
              { status: 500 },
            )
          : HttpResponse.json({ data: prescripcion() }),
      ),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo cargar la prescripción/);
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /Paracetamol/ })).toBeInTheDocument();
  });

  it('si no se pueden cargar los medicamentos, el selector lo dice', async () => {
    servidor.use(
      http.get('*/api/insumos', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await waitFor(() =>
      expect(screen.getByLabelText(/^Medicamento/)).toHaveAccessibleDescription(
        /No se pudo cargar la lista de medicamentos/,
      ),
    );
  });

  it('muestra de qué paciente es la prescripción', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    expect(ficha).toHaveTextContent('Benítez, Rosa');
    expect(ficha).toHaveTextContent('DNI 30111222');
    expect(ficha).toHaveTextContent('Cama A-01');
  });

  it('al guardar muestra el paciente y qué cambia, antes y después', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    await userEvent.selectOptions(screen.getByLabelText('Frecuencia'), 'Cada 12 horas');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const dialogo = screen.getByRole('dialog', { name: /Guardar cambios/ });
    expect(dialogo).toHaveTextContent(/Benítez, Rosa.*Cama A-01/);
    const tabla = within(dialogo).getByRole('table', { name: 'Cambios' });
    const filas = within(tabla).getAllByRole('row');
    expect(filas).toHaveLength(3);
    expect(filas[1]).toHaveTextContent(/Dosis\s*500 mg\s*1000 mg/);
    expect(filas[2]).toHaveTextContent(/Frecuencia\s*cada 8 h\s*cada 12 h/);
  });

  it('suspender (se puede reanudar) no se ve tan grave como finalizar (no se puede)', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const suspender = await screen.findByRole('button', { name: 'Suspender' });
    const finalizar = screen.getByRole('button', { name: 'Finalizar' });
    expect(suspender).not.toHaveClass('MuiButton-colorError');
    expect(finalizar).toHaveClass('MuiButton-colorError');
  });

  it('al suspender nombra el medicamento y el paciente', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Suspender' }));
    const dialogo = screen.getByRole('dialog', { name: /Suspender/ });
    expect(dialogo).toHaveTextContent(/Paracetamol 500 mg cada 8 h de Benítez, Rosa \(cama A-01\)/);
  });

  it('suspende la prescripción con motivo', async () => {
    let enviado: unknown;
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.post('*/api/prescripciones/40/estado', async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json({
          data: prescripcion({
            estado: 'SUSPENDIDA',
            proximaToma: null,
            motivoCambioEstado: 'Hipotensión',
          }),
        });
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Suspender' }));
    const dialogo = screen.getByRole('dialog', { name: /Suspender/ });
    await userEvent.type(within(dialogo).getByLabelText(/Motivo/), 'Hipotensión');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Suspender' }));

    expect(await screen.findByText('Suspendida')).toBeInTheDocument();
    expect(enviado).toEqual({ estado: 'SUSPENDIDA', motivo: 'Hipotensión' });
  });

  it('el enfermero ve la prescripción y su agenda pero no puede modificarla', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', ENFERMERO);

    expect(await screen.findByRole('heading', { name: /Paracetamol/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Próximas tomas' }).children).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('Guardar cambios deshabilitado dice por qué: sin cambios o dosis inválida (UX-17)', async () => {
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription('No hay cambios para guardar');
    expect(screen.getByText('No hay cambios para guardar')).toBeVisible();

    await userEvent.clear(dosis);
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription('Revise la dosis');

    await userEvent.type(dosis, '1000');
    expect(guardar).toBeEnabled();
    expect(guardar).not.toHaveAccessibleDescription();
    expect(screen.queryByText('Revise la dosis')).not.toBeInTheDocument();
  });

  it('no deja guardar cambios sin ver al paciente y lo dice junto al botón (UX-06)', async () => {
    let liberar!: () => void;
    const llega = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.get('*/api/pacientes/7', async () => {
        await llega;
        return HttpResponse.json({ data: paciente() });
      }),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    expect(await screen.findByText('Cargando los datos del paciente…')).toBeInTheDocument();
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription('Esperando los datos del paciente…');

    liberar();
    await screen.findByRole('region', { name: 'Paciente' });
    expect(screen.queryByText('Cargando los datos del paciente…')).not.toBeInTheDocument();
    expect(guardar).toBeEnabled();
    expect(guardar).not.toHaveAccessibleDescription();
  });

  it('si no se puede cargar al paciente lo dice y deja reintentar, sin guardar a ciegas (UX-06)', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/prescripciones/40', () => HttpResponse.json({ data: prescripcion() })),
      http.get('*/api/pacientes/7', () =>
        fallar ? errorDelServidor() : HttpResponse.json({ data: paciente() }),
      ),
    );
    renderizarApp('/prescripciones/40', MEDICO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar los datos del paciente/);
    const dosis = await screen.findByLabelText(/^Dosis/);
    await waitFor(() => expect(dosis).toHaveValue(500));
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '1000');
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription(/sin los datos del paciente/i);

    fallar = false;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Paciente' })).toBeInTheDocument();
    expect(guardar).toBeEnabled();
  });
});
