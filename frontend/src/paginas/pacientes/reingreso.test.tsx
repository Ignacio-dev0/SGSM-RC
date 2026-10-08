// Reingreso de un paciente egresado desde su ficha (F18): con sus datos y sin borrar lo que no se tocó.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MEDICO } from '../../pruebas/datos';
import { paciente, simularCatalogosDePacientes } from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const egresada = paciente({
  estado: 'EGRESADO',
  cama: null,
  fechaEgreso: '2026-10-05T12:00:00.000Z',
  motivoEgreso: 'Alta médica',
  numeroAfiliado: '123456',
});

/** Responde la ficha y registra lo que se manda al reingresar. */
function prepararReingreso() {
  const enviados: Record<string, unknown>[] = [];
  simularCatalogosDePacientes();
  servidor.use(
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: egresada })),
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
    http.get('*/api/pacientes/7/estudios', () => HttpResponse.json({ data: [] })),
    http.post('*/api/pacientes/7/reingresar', async ({ request }) => {
      enviados.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ data: paciente() });
    }),
  );
  return enviados;
}

async function elegirCamaYConfirmar() {
  await userEvent.selectOptions(
    screen.getByLabelText(/^Cama/),
    await screen.findByRole('option', { name: /A-02/ }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Registrar reingreso' }));
}

describe('reingreso desde la ficha de un paciente egresado (F18)', () => {
  it('la ficha de un egresado ofrece registrar el reingreso, con el formulario ya cargado', async () => {
    prepararReingreso();
    renderizarApp('/pacientes/7?pestana=datos', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar reingreso' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reingreso de Benítez, Rosa' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^DNI/)).toHaveValue('30111222'));
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Rosa');
    expect(screen.getByLabelText(/^Fecha de nacimiento/)).toHaveValue('1948-03-15');
    expect(screen.getByLabelText(/^Obra social/)).toHaveValue('IOMA');
    expect(screen.getByLabelText(/^N.º de afiliado/)).toHaveValue('123456');
    expect(screen.getByLabelText(/^Diagnóstico/)).toHaveValue('ACV isquémico');
  });

  it('manda la cama y solo lo que se cambió: lo que no se tocó queda como estaba', async () => {
    const enviados = prepararReingreso();
    renderizarApp('/pacientes/nuevo?reingreso=7', MEDICO);

    const diagnostico = await screen.findByLabelText(/^Diagnóstico/);
    await waitFor(() => expect(diagnostico).toHaveValue('ACV isquémico'));
    await userEvent.clear(diagnostico);
    await userEvent.type(diagnostico, 'Neumonía');
    await elegirCamaYConfirmar();

    expect(await screen.findByRole('heading', { level: 1, name: 'Benítez, Rosa' })).toBeVisible();
    expect(enviados).toEqual([{ camaId: 2, diagnostico: 'Neumonía' }]);
  });

  it('sin cambios en los datos, manda solo la cama', async () => {
    const enviados = prepararReingreso();
    renderizarApp('/pacientes/nuevo?reingreso=7', MEDICO);

    await waitFor(() => expect(screen.getByLabelText(/^DNI/)).toHaveValue('30111222'));
    await elegirCamaYConfirmar();

    await screen.findByRole('heading', { level: 1, name: 'Benítez, Rosa' });
    expect(enviados).toEqual([{ camaId: 2 }]);
  });

  it('si la persona ya está internada, no ofrece el reingreso y lleva a su ficha', async () => {
    simularCatalogosDePacientes();
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
    renderizarApp('/pacientes/nuevo?reingreso=7', MEDICO);

    expect(
      await screen.findByText(/Benítez, Rosa tiene una internación en curso/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar reingreso' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la ficha' })).toHaveAttribute(
      'href',
      '/pacientes/7',
    );
  });
});

describe('reingreso desde Internar paciente con el DNI de un egresado (F18)', () => {
  it('los opcionales que quedaron vacíos no borran los de la ficha', async () => {
    let reingreso: Record<string, unknown> | undefined;
    simularCatalogosDePacientes();
    servidor.use(
      http.post('*/api/pacientes', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'PACIENTE_EGRESADO',
              mensaje: 'Benítez, Rosa ya estuvo internado. Puede registrar su reingreso.',
              detalles: { pacienteId: 7 },
            },
          },
          { status: 409 },
        ),
      ),
      http.post('*/api/pacientes/7/reingresar', async ({ request }) => {
        reingreso = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: paciente() });
      }),
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    await userEvent.type(await screen.findByLabelText(/^DNI/), '30111222');
    await userEvent.type(screen.getByLabelText(/^Nombre/), 'Rosa');
    await userEvent.type(screen.getByLabelText(/^Apellido/), 'Benítez');
    await userEvent.type(screen.getByLabelText(/^Fecha de nacimiento/), '1948-03-15');
    await userEvent.selectOptions(screen.getByLabelText(/^Sexo/), 'Femenino');
    await userEvent.selectOptions(
      screen.getByLabelText(/^Cama/),
      await screen.findByRole('option', { name: /A-02/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Internar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar reingreso' }));

    await screen.findByRole('heading', { level: 1, name: 'Benítez, Rosa' });
    expect(reingreso).toEqual({
      camaId: 2,
      dni: '30111222',
      nombre: 'Rosa',
      apellido: 'Benítez',
      fechaNacimiento: '1948-03-15',
      sexo: 'FEMENINO',
    });
  });
});
