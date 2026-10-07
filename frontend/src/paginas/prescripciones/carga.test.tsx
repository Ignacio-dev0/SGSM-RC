import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MEDICO } from '../../pruebas/datos';
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

describe('carga de prescripción (T304 · CU17)', () => {
  async function completar() {
    // No se puede guardar hasta ver a qué paciente se le indica (UX-06).
    await screen.findByRole('region', { name: 'Paciente' });
    await screen.findByRole('option', { name: /Paracetamol/ });
    await userEvent.selectOptions(
      screen.getByLabelText(/^Medicamento/),
      screen.getByRole('option', { name: /Paracetamol/ }),
    );
    await userEvent.type(screen.getByLabelText(/^Dosis/), '500');
    await userEvent.selectOptions(screen.getByLabelText(/^Frecuencia/), 'Cada 8 horas');
    await userEvent.selectOptions(screen.getByLabelText(/^Vía/), 'Oral');
  }

  it('carga la prescripción con la unidad del medicamento y muestra los horarios', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.post('*/api/pacientes/7/prescripciones', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: prescripcion() }, { status: 201 });
      }),
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await completar();
    expect(screen.getByLabelText(/^Unidad/)).toHaveValue('mg');
    expect(screen.getByText(/Primeras tomas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Prescripción cargada/);
    expect(enviado).toMatchObject({
      insumoId: 1,
      dosis: 500,
      unidadDosis: 'mg',
      frecuenciaHoras: 8,
      via: 'ORAL',
      fechaInicio: expect.any(String),
    });
  });

  it('identifica al paciente para el que se carga la prescripción', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    expect(ficha).toHaveTextContent('Benítez, Rosa');
    expect(ficha).toHaveTextContent('DNI 30111222');
    expect(ficha).toHaveTextContent(/Cama A.01/);
  });

  it('valida la dosis al salir del campo y los datos obligatorios al guardar', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    const dosis = await screen.findByLabelText(/^Dosis/);
    await userEvent.type(dosis, '0');
    // Mientras escribe no se avisa: el "0" de "0,5" todavía no es un error (UX-20b).
    expect(dosis).not.toHaveAttribute('aria-invalid', 'true');
    // Al salir del campo, un 0 sí se avisa.
    await userEvent.tab();
    expect(dosis).toHaveAccessibleDescription('La dosis debe ser mayor a 0');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));
    // Al guardar, el aviso de la dosis sigue y se suman los datos que faltan.
    expect(dosis).toHaveAccessibleDescription('La dosis debe ser mayor a 0');
    expect(screen.getByLabelText(/^Medicamento/)).toHaveAccessibleDescription(
      'Elija el medicamento',
    );
    // La lista de medicamentos cargó: falta elegir, no hay nada que reintentar (E5-07).
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Vía/)).toHaveAccessibleDescription('Elija la vía');
    // El foco va al primer campo con error, para corregirlo sin buscarlo.
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-invalid', 'true'));
  });

  it('escribir 0,5 no avisa error a mitad de camino, y el aviso de un 0 se va al corregirlo', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const dosis = await screen.findByLabelText(/^Dosis/);
    await userEvent.type(dosis, '0');
    expect(dosis).not.toHaveAccessibleDescription();
    await userEvent.type(dosis, '.5');
    await userEvent.tab();
    expect(dosis).toHaveValue(0.5);
    expect(dosis).not.toHaveAttribute('aria-invalid', 'true');

    // Un 0 avisado al salir se limpia apenas se vuelve a escribir.
    await userEvent.clear(dosis);
    await userEvent.type(dosis, '0');
    await userEvent.tab();
    expect(dosis).toHaveAccessibleDescription('La dosis debe ser mayor a 0');
    await userEvent.type(dosis, '.5');
    expect(dosis).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('guardar con un 0 recién escrito (sin salir del campo) también lo avisa', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    await userEvent.type(await screen.findByLabelText(/^Dosis/), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));

    expect(screen.getByLabelText(/^Dosis/)).toHaveAccessibleDescription(
      'La dosis debe ser mayor a 0',
    );
  });

  it('no deja guardar sin ver al paciente y lo dice junto al botón (UX-06)', async () => {
    let liberar!: () => void;
    const llega = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/pacientes/7', async () => {
        await llega;
        return HttpResponse.json({ data: paciente() });
      }),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    expect(await screen.findByText('Cargando los datos del paciente…')).toBeInTheDocument();
    const guardar = screen.getByRole('button', { name: 'Guardar prescripción' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription('Esperando los datos del paciente…');
    expect(screen.getByText('Esperando los datos del paciente…')).toBeVisible();

    liberar();
    expect(await screen.findByRole('region', { name: 'Paciente' })).toHaveTextContent(
      'Benítez, Rosa',
    );
    expect(screen.queryByText('Cargando los datos del paciente…')).not.toBeInTheDocument();
    expect(guardar).toBeEnabled();
    expect(guardar).not.toHaveAccessibleDescription();
  });

  it('si no se puede cargar al paciente lo dice, deja reintentar y no deja guardar (UX-06)', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/pacientes/7', () =>
        fallar ? errorDelServidor() : HttpResponse.json({ data: paciente() }),
      ),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar los datos del paciente/);
    const guardar = screen.getByRole('button', { name: 'Guardar prescripción' });
    expect(guardar).toBeDisabled();
    expect(guardar).toHaveAccessibleDescription(/sin los datos del paciente/i);

    fallar = false;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Paciente' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(guardar).toBeEnabled();
  });

  it('T307: avisa si ya hay una vigente del mismo medicamento y permite cargarla igual', async () => {
    const envios: Record<string, unknown>[] = [];
    servidor.use(
      http.post('*/api/pacientes/7/prescripciones', async ({ request }) => {
        const cuerpo = (await request.json()) as Record<string, unknown>;
        envios.push(cuerpo);
        if (!cuerpo.confirmarDuplicada) {
          return HttpResponse.json(
            {
              error: {
                codigo: 'PRESCRIPCION_DUPLICADA',
                mensaje: 'El paciente ya tiene una prescripción vigente de Paracetamol',
                detalles: {
                  prescripciones: [
                    { id: 40, dosis: 1000, unidadDosis: 'mg', frecuenciaHoras: 6, via: 'ORAL' },
                  ],
                },
              },
            },
            { status: 409 },
          );
        }
        return HttpResponse.json({ data: prescripcion() }, { status: 201 });
      }),
      http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await completar();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/ya tiene una prescripción vigente/);
    expect(aviso).toHaveTextContent(/1000 mg cada 6 h/);

    await userEvent.click(within(aviso).getByRole('button', { name: 'Cargar igual' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Prescripción cargada/);
    expect(envios.at(-1)).toMatchObject({ confirmarDuplicada: true });
  });

  it('T307: el aviso de posible duplicada toma el foco al aparecer, porque pide una decisión (UX-12)', async () => {
    servidor.use(
      http.post('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'PRESCRIPCION_DUPLICADA',
              mensaje: 'El paciente ya tiene una prescripción vigente de Paracetamol',
              detalles: {
                prescripciones: [
                  { id: 40, dosis: 1000, unidadDosis: 'mg', frecuenciaHoras: 6, via: 'ORAL' },
                ],
              },
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await completar();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));

    const aviso = (await screen.findByText('Posible prescripción duplicada')).closest(
      '[role="alert"]',
    );
    expect(aviso).toHaveTextContent('Cargar igual');
    await waitFor(() => expect(aviso).toHaveFocus());
  });
});

describe('carga de prescripción: botonera y campos numéricos (F31 · UX-19)', () => {
  /** Los botones de la botonera del formulario, en el orden en que se leen. */
  const botonera = () =>
    within(screen.getByRole('group', { name: 'Acciones del formulario' })).getAllByRole('button');

  it('Cancelar va antes y la acción principal, Guardar prescripción, es la última del grupo', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await screen.findByRole('region', { name: 'Paciente' });
    expect(botonera().map((b) => b.textContent)).toEqual(['Cancelar', 'Guardar prescripción']);
    expect(botonera().at(-1)).toHaveAttribute('type', 'submit');
  });

  it('el motivo por el que no se puede guardar queda dentro de la botonera, junto al botón', async () => {
    let liberar!: () => void;
    const llega = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/pacientes/7', async () => {
        await llega;
        return HttpResponse.json({ data: paciente() });
      }),
    );
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const grupo = await screen.findByRole('group', { name: 'Acciones del formulario' });
    expect(within(grupo).getByText('Esperando los datos del paciente…')).toBeVisible();
    expect(botonera().at(-1)).toHaveAccessibleDescription('Esperando los datos del paciente…');
    liberar();
    await screen.findByRole('region', { name: 'Paciente' });
  });

  it('la rueda del mouse no cambia la dosis: el campo suelta el foco', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    const dosis = await screen.findByLabelText(/^Dosis/);
    await userEvent.type(dosis, '500');
    expect(dosis).toHaveFocus();

    fireEvent.wheel(dosis, { deltaY: -100 });

    expect(dosis).not.toHaveFocus();
    expect(dosis).toHaveValue(500);
  });
});
