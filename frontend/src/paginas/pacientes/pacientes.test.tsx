import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import {
  HISTORIAL,
  listaDePacientes,
  paciente,
  simularCatalogosDePacientes,
} from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(() => simularCatalogosDePacientes());

async function completarDatosPersonales() {
  await userEvent.type(await screen.findByLabelText(/^DNI/), '30111222');
  await userEvent.type(screen.getByLabelText(/^Nombre/), 'Rosa');
  await userEvent.type(screen.getByLabelText(/^Apellido/), 'Benítez');
  await userEvent.type(screen.getByLabelText(/^Fecha de nacimiento/), '1948-03-15');
  await userEvent.selectOptions(screen.getByLabelText(/^Sexo/), 'Femenino');
}

describe('búsqueda de pacientes (T206 · CU12)', () => {
  it('muestra los internados y encuentra al paciente en dos toques', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return listaDePacientes([paciente()]);
      }),
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    );
    renderizarApp('/pacientes', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    expect(pedidos[0]?.get('estado')).toBe('INTERNADO');

    await userEvent.type(screen.getByLabelText(/Buscar/), 'beni');
    await waitFor(() => expect(pedidos.at(-1)?.get('texto')).toBe('beni'));

    await userEvent.click(await within(tabla).findByText('Benítez, Rosa'));
    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
  });

  it('filtra por sala y estado', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return listaDePacientes([]);
      }),
    );
    renderizarApp('/pacientes', ENFERMERO);

    await screen.findByRole('option', { name: 'Sala B – Traumatología' });
    await userEvent.selectOptions(screen.getByLabelText('Sala'), 'Sala B – Traumatología');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Egresados');

    await waitFor(() => {
      expect(pedidos.at(-1)?.get('salaId')).toBe('2');
      expect(pedidos.at(-1)?.get('estado')).toBe('EGRESADO');
    });
    expect(await screen.findByText(/No se encontraron pacientes/)).toBeInTheDocument();
  });

  it('solo quien puede gestionar pacientes ve el botón para internar', async () => {
    servidor.use(http.get('*/api/pacientes', () => listaDePacientes([])));
    renderizarApp('/pacientes', ENFERMERO);
    await screen.findByRole('table', { name: 'Pacientes' });
    expect(screen.queryByRole('button', { name: /Internar paciente/ })).not.toBeInTheDocument();
  });
});

describe('registro de paciente con cama (T205 · CU11 · CU15)', () => {
  it('interna al paciente en la cama elegida', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.post('*/api/pacientes', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: paciente({ id: 7 }) }, { status: 201 });
      }),
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    await completarDatosPersonales();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Cama/),
      screen.getByRole('option', { name: /B-01/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Internar' }));

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/internado/);
    expect(enviado).toMatchObject({
      dni: '30111222',
      apellido: 'Benítez',
      fechaNacimiento: '1948-03-15',
      sexo: 'FEMENINO',
      camaId: 9,
    });
  });

  it('si no hay camas libres para internar, lo dice en el campo', async () => {
    servidor.use(http.get('*/api/camas', () => HttpResponse.json({ data: [] })));
    renderizarApp('/pacientes/nuevo', MEDICO);

    await waitFor(() =>
      expect(screen.getByLabelText(/^Cama/)).toHaveAccessibleDescription(/No hay camas libres/),
    );
  });

  it('si no se pueden cargar las camas, lo dice en el campo', async () => {
    servidor.use(
      http.get('*/api/camas', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    await waitFor(() =>
      expect(screen.getByLabelText(/^Cama/)).toHaveAccessibleDescription(
        /No se pudo cargar la lista de camas/,
      ),
    );
  });

  it('pide los datos obligatorios y la cama', async () => {
    renderizarApp('/pacientes/nuevo', MEDICO);
    await userEvent.click(await screen.findByRole('button', { name: 'Internar' }));
    expect(screen.getByLabelText(/^DNI/)).toHaveAccessibleDescription('Ingrese el DNI');
    expect(screen.getByLabelText(/^Cama/)).toHaveAccessibleDescription('Elija la cama');
  });

  it('muestra en el campo la cama que otro ocupó mientras se cargaba', async () => {
    servidor.use(
      http.post('*/api/pacientes', () =>
        HttpResponse.json(
          { error: { codigo: 'CAMA_OCUPADA', mensaje: 'La cama B-01 ya está ocupada' } },
          { status: 409 },
        ),
      ),
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    await completarDatosPersonales();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Cama/),
      screen.getByRole('option', { name: /B-01/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Internar' }));

    expect(await screen.findByLabelText(/^Cama/)).toHaveAccessibleDescription(
      'La cama B-01 ya está ocupada',
    );
  });

  it('si el paciente ya estuvo internado ofrece registrar su reingreso', async () => {
    let reingreso: Record<string, unknown> | undefined;
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
    );
    renderizarApp('/pacientes/nuevo', MEDICO);

    await completarDatosPersonales();
    await userEvent.selectOptions(
      screen.getByLabelText(/^Cama/),
      screen.getByRole('option', { name: /A-02/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Internar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar reingreso' }));

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    expect(reingreso).toMatchObject({ camaId: 2, dni: '30111222' });
  });
});

describe('ficha del paciente: modificación, traslado y baja (T207 · T208 · CU13–CU15)', () => {
  it('muestra los datos del paciente y su cama', async () => {
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
    renderizarApp('/pacientes/7', ENFERMERO);

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    expect(screen.getByText(/DNI 30111222/)).toBeInTheDocument();
    expect(screen.getAllByText(/A-01/).length).toBeGreaterThan(0);
    expect(screen.getByText('ACV isquémico')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trasladar' })).not.toBeInTheDocument();
  });

  it('si los datos a editar no se pueden cargar, no muestra el formulario vacío', async () => {
    servidor.use(
      http.get('*/api/pacientes/7', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/pacientes/7/editar', MEDICO);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudieron cargar los datos del paciente/,
    );
    expect(screen.queryByLabelText(/^Apellido/)).not.toBeInTheDocument();
  });

  it('edita los datos personales', async () => {
    let enviado: Record<string, unknown> | undefined;
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
      http.patch('*/api/pacientes/7', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: paciente({ obraSocial: 'PAMI' }) });
      }),
    );
    renderizarApp('/pacientes/7/editar', MEDICO);

    const obra = await screen.findByLabelText(/^Obra social/);
    await waitFor(() => expect(obra).toHaveValue('IOMA'));
    await userEvent.clear(obra);
    await userEvent.type(obra, 'PAMI');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/guardaron/);
    expect(enviado).toMatchObject({ obraSocial: 'PAMI' });
  });

  it('traslada al paciente a otra cama', async () => {
    let actual = paciente();
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: actual })),
      http.post('*/api/pacientes/7/trasladar', async ({ request }) => {
        const { camaId } = (await request.json()) as { camaId: number };
        actual = paciente({
          cama: {
            id: camaId,
            numero: 'B-01',
            sala: { id: 2, nombre: 'Sala B – Traumatología' },
            desde: new Date().toISOString(),
          },
        });
        return HttpResponse.json({ data: actual });
      }),
    );
    renderizarApp('/pacientes/7', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Trasladar' }));
    const dialogo = screen.getByRole('dialog', { name: /Trasladar/ });
    await userEvent.selectOptions(
      within(dialogo).getByLabelText(/Cama nueva/),
      within(dialogo).getByRole('option', { name: /B-01/ }),
    );
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Trasladar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/B-01/);
  });

  it('da de alta al paciente con motivo', async () => {
    let enviado: Record<string, unknown> | undefined;
    let actual = paciente();
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: actual })),
      http.post('*/api/pacientes/7/egresar', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        actual = paciente({
          estado: 'EGRESADO',
          cama: null,
          fechaEgreso: new Date().toISOString(),
          motivoEgreso: 'Alta médica',
        });
        return HttpResponse.json({ data: actual });
      }),
    );
    renderizarApp('/pacientes/7', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de alta' }));
    const dialogo = screen.getByRole('dialog', { name: /Dar de alta/ });
    expect(within(dialogo).getByText(/suspenderán sus prescripciones/)).toBeInTheDocument();
    await userEvent.type(within(dialogo).getByLabelText(/Motivo del egreso/), 'Alta médica');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Dar de alta' }));

    expect(await screen.findByText('Egresado')).toBeInTheDocument();
    expect(enviado).toMatchObject({ motivo: 'Alta médica' });
    expect(enviado?.fechaEgreso).toEqual(expect.any(String));
  });

  it('si la ficha no se puede cargar lo dice y deja reintentar (no queda en blanco)', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/pacientes/7', () =>
        fallar
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
              { status: 500 },
            )
          : HttpResponse.json({ data: paciente() }),
      ),
    );
    renderizarApp('/pacientes/7', ENFERMERO);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudo cargar la ficha del paciente/,
    );
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: /Benítez, Rosa/ })).toBeInTheDocument();
  });

  it('el encabezado de la ficha dice la cama primero, igual que en el resto de las pantallas', async () => {
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
    renderizarApp('/pacientes/7', ENFERMERO);

    expect(
      await screen.findByText('Cama A-01 · Sala A – Neurorrehabilitación'),
    ).toBeInTheDocument();
  });

  it('el traslado nombra al paciente y no deja confirmar sin elegir la cama', async () => {
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
    renderizarApp('/pacientes/7', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Trasladar' }));
    const dialogo = screen.getByRole('dialog', { name: /Trasladar/ });
    expect(dialogo).toHaveTextContent(/Benítez, Rosa/);
    expect(dialogo).toHaveTextContent(/Cama actual: Sala A – Neurorrehabilitación · A-01/);
    const trasladar = within(dialogo).getByRole('button', { name: 'Trasladar' });
    expect(trasladar).toBeDisabled();
    await userEvent.selectOptions(
      within(dialogo).getByLabelText(/Cama nueva/),
      await within(dialogo).findByRole('option', { name: /B-01/ }),
    );
    expect(trasladar).toBeEnabled();
  });

  it('si no hay camas libres para trasladar, lo dice', async () => {
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
      http.get('*/api/camas', () => HttpResponse.json({ data: [] })),
    );
    renderizarApp('/pacientes/7', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Trasladar' }));
    const dialogo = screen.getByRole('dialog', { name: /Trasladar/ });
    expect(await within(dialogo).findByText(/No hay camas libres/)).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Trasladar' })).toBeDisabled();
  });

  it('dar de alta nombra al paciente y su cama y dice cómo volver a internarlo', async () => {
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
    renderizarApp('/pacientes/7', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de alta' }));
    const dialogo = screen.getByRole('dialog', { name: /Dar de alta/ });
    expect(dialogo).toHaveTextContent(/Benítez, Rosa/);
    expect(dialogo).toHaveTextContent(/cama A-01/);
    expect(dialogo).toHaveTextContent(/Internar paciente.*reingreso/);
  });

  it('dar de alta valida la fecha: vacía o futura no se puede confirmar', async () => {
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
    renderizarApp('/pacientes/7', MEDICO);

    await userEvent.click(await screen.findByRole('button', { name: 'Dar de alta' }));
    const dialogo = screen.getByRole('dialog', { name: /Dar de alta/ });
    await userEvent.type(within(dialogo).getByLabelText(/Motivo del egreso/), 'Alta médica');
    const fecha = within(dialogo).getByLabelText(/Fecha y hora de egreso/);
    const confirmar = within(dialogo).getByRole('button', { name: 'Dar de alta' });

    fireEvent.change(fecha, { target: { value: '' } });
    expect(fecha).toHaveAccessibleDescription('Indique la fecha y hora del egreso');
    expect(confirmar).toBeDisabled();

    fireEvent.change(fecha, { target: { value: '2999-01-01T10:00' } });
    expect(fecha).toHaveAccessibleDescription('No puede ser posterior a ahora');
    expect(confirmar).toBeDisabled();
  });
});

describe('historial del paciente (T209 · CU16)', () => {
  it('muestra camas, modificaciones y suministros, filtrables por fecha', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
      http.get('*/api/pacientes/7/historial', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: HISTORIAL });
      }),
    );
    renderizarApp('/pacientes/7', ENFERMERO);

    await userEvent.click(await screen.findByRole('tab', { name: 'Historial' }));

    expect(await screen.findByText(/Sala B – Traumatología · B-01/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Modificaciones/ }));
    expect(await screen.findByText(/IOMA/)).toBeInTheDocument();
    expect(screen.getByText(/PAMI/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Suministros/ }));
    expect(await screen.findByText(/Gasa estéril/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-02');
    await waitFor(() => expect(pedidos.at(-1)?.get('desde')).toMatch(/^2026-10-02/));
  });

  it('el registro del paciente figura como "Internación", no como "Alta"', async () => {
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
      http.get('*/api/pacientes/7/historial', () =>
        HttpResponse.json({
          data: {
            ...HISTORIAL,
            modificaciones: [
              {
                id: 1,
                fechaHora: '2026-10-01T13:00:00.000Z',
                accion: 'CREAR',
                entidad: 'Paciente',
                usuario: 'Ferreyra, Martín',
                valorAnterior: null,
                valorNuevo: null,
                detalle: null,
              },
            ],
          },
        }),
      ),
    );
    renderizarApp('/pacientes/7', ENFERMERO);

    await userEvent.click(await screen.findByRole('tab', { name: 'Historial' }));
    await userEvent.click(await screen.findByRole('tab', { name: /Modificaciones/ }));
    const tabla = await screen.findByRole('table', { name: 'Modificaciones' });
    expect(await within(tabla).findByText('Internación')).toBeInTheDocument();
    expect(within(tabla).queryByText('Alta')).not.toBeInTheDocument();
  });
});
