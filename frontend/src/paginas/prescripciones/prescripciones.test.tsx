import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Insumo, Prescripcion } from '../../api/tipos';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import { paciente, simularCatalogosDePacientes } from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const MEDICAMENTOS: Insumo[] = [
  {
    id: 1,
    nombre: 'Paracetamol',
    tipo: 'MEDICAMENTO',
    unidadMedida: 'mg',
    presentacion: 'Comprimidos 500 mg',
    activo: true,
  },
  {
    id: 2,
    nombre: 'Enalapril',
    tipo: 'MEDICAMENTO',
    unidadMedida: 'mg',
    presentacion: 'Comprimidos 10 mg',
    activo: true,
  },
];

const prescripcion = (extra: Partial<Prescripcion> = {}): Prescripcion => ({
  id: 40,
  pacienteId: 7,
  medicamento: {
    id: 1,
    nombre: 'Paracetamol',
    presentacion: 'Comprimidos 500 mg',
    unidadMedida: 'mg',
  },
  dosis: 500,
  unidadDosis: 'mg',
  frecuenciaHoras: 8,
  via: 'ORAL',
  fechaInicio: '2026-10-07T11:00:00.000Z',
  fechaFin: null,
  observaciones: 'Si fiebre',
  estado: 'VIGENTE',
  motivoCambioEstado: null,
  prescriptor: 'Ferreyra, Martín',
  creadoEn: '2026-10-07T11:00:00.000Z',
  proximaToma: '2026-10-07T19:00:00.000Z',
  ultimasAdministraciones: [
    { id: 3, fechaHora: '2026-10-07T11:05:00.000Z', cantidad: 500, usuario: 'Acosta, Sofía' },
  ],
  agenda: ['2026-10-07T19:00:00.000Z', '2026-10-08T03:00:00.000Z', '2026-10-08T11:00:00.000Z'],
  ...extra,
});

beforeEach(() => {
  simularCatalogosDePacientes();
  servidor.use(
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/insumos', () => HttpResponse.json({ data: MEDICAMENTOS })),
  );
});

describe('prescripciones del paciente (T305 · CU18)', () => {
  it('lista las prescripciones con dosis, frecuencia, próxima toma y últimas administraciones', async () => {
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () =>
        HttpResponse.json({ data: [prescripcion()] }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Prescripciones' });
    await within(tabla).findByText('Paracetamol');
    const fila = within(tabla).getAllByRole('row')[1]!;
    expect(fila).toHaveTextContent('Paracetamol');
    expect(fila).toHaveTextContent('500 mg');
    expect(fila).toHaveTextContent('cada 8 h');
    expect(fila).toHaveTextContent('Oral');
    expect(fila).toHaveTextContent('Vigente');
    expect(fila).toHaveTextContent(/Acosta/);
    expect(screen.queryByRole('button', { name: /Nueva prescripción/ })).not.toBeInTheDocument();
  });

  it('filtra entre vigentes y todas', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: [] });
      }),
    );
    renderizarApp('/pacientes/7?pestana=prescripciones', MEDICO);

    await screen.findByRole('table', { name: 'Prescripciones' });
    expect(pedidos[0]?.get('estado')).toBe('VIGENTE');
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'Todas');
    await waitFor(() => expect(pedidos.at(-1)?.has('estado')).toBe(false));
  });
});

describe('carga de prescripción (T304 · CU17)', () => {
  async function completar() {
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

  it('valida en línea la dosis y los datos obligatorios', async () => {
    renderizarApp('/pacientes/7/prescripciones/nueva', MEDICO);

    await userEvent.type(await screen.findByLabelText(/^Dosis/), '0');
    expect(screen.getByLabelText(/^Dosis/)).toHaveAccessibleDescription(
      'La dosis debe ser mayor a 0',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Guardar prescripción' }));
    expect(screen.getByLabelText(/^Medicamento/)).toHaveAccessibleDescription(
      'Elija el medicamento',
    );
    expect(screen.getByLabelText(/^Vía/)).toHaveAccessibleDescription('Elija la vía');
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
});

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
});
