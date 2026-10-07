import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { UsuarioSesion } from '../../api/tipos';
import { ProveedorSesion } from '../../auth/ContextoSesion';
import { RutasApp } from '../../RutasApp';
import { tema } from '../../tema';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import {
  HISTORIAL,
  listaDePacientes,
  paciente,
  simularCatalogosDePacientes,
} from '../../pruebas/datosPacientes';
import { renderizarApp, simularSesion } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(() => {
  simularCatalogosDePacientes();
  servidor.use(http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [] })));
});

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
    expect(
      await screen.findByText(
        'No hay pacientes egresados en Sala B – Traumatología. Elija otra sala, o cambie Estado a Todos.',
      ),
    ).toBeInTheDocument();
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
    // El foco va al primer campo con error, para corregirlo sin buscarlo.
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-invalid', 'true'));
    expect(document.activeElement).toBe(screen.getByLabelText(/^DNI/));
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
    renderizarApp('/pacientes/7?pestana=datos', ENFERMERO);

    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();
    expect(screen.getByText(/DNI 30111222/)).toBeInTheDocument();
    expect(screen.getAllByText(/A-01/).length).toBeGreaterThan(0);
    expect(screen.getByText('ACV isquémico')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trasladar' })).not.toBeInTheDocument();
  });

  it('la ficha abre en Prescripciones: lo primero que se busca al lado de la cama', async () => {
    servidor.use(http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })));
    renderizarApp('/pacientes/7', ENFERMERO);

    expect(await screen.findByRole('tab', { name: 'Prescripciones' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
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

  it('un suministro del historial se abre con su detalle (y Corregir, si corresponde)', async () => {
    servidor.use(
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
      http.get('*/api/pacientes/7/historial', () => HttpResponse.json({ data: HISTORIAL })),
      http.get('*/api/suministros/:id', ({ params }) =>
        HttpResponse.json({
          data: {
            id: Number(params.id),
            tipo: 'INSUMOS',
            fechaHora: new Date().toISOString(),
            paciente: { id: 7, apellido: 'Benítez', nombre: 'Rosa', dni: '30111222', cama: 'A-01' },
            usuario: { id: 3, nombre: 'Acosta, Sofía' },
            prescripcion: null,
            tomaProgramada: null,
            detalles: [
              {
                insumoId: 20,
                insumo: 'Gasa estéril',
                tipoInsumo: 'INSUMO',
                cantidad: 2,
                unidad: 'unidad',
              },
            ],
            observaciones: null,
            validadoBiometricamente: true,
            corregido: false,
            motivoCorreccion: null,
            corregidoEn: null,
            corregidoPor: null,
            corregibleHasta: new Date(Date.now() + 3_600_000).toISOString(),
          },
        }),
      ),
    );
    renderizarApp('/pacientes/7?pestana=historial', ENFERMERO);

    await userEvent.click(await screen.findByRole('tab', { name: /Suministros/ }));
    await userEvent.click(await screen.findByText(/Gasa estéril/));

    const dialogo = await screen.findByRole('dialog', { name: /Suministro/ });
    expect(within(dialogo).getByRole('button', { name: 'Corregir' })).toBeInTheDocument();
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

/** Botón de prueba que hace lo mismo que el "Atrás" del navegador o del gesto de la tablet. */
function BotonAtras() {
  const navegar = useNavigate();
  return <button onClick={() => navegar(-1)}>Atrás del navegador</button>;
}

/** Como renderizarApp, pero con un botón para navegar hacia atrás por el historial. */
function renderizarConAtras(ruta: string, usuario: UsuarioSesion) {
  simularSesion(usuario);
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cliente}>
      <ThemeProvider theme={tema}>
        <MemoryRouter initialEntries={[ruta]}>
          <ProveedorSesion>
            <RutasApp />
          </ProveedorSesion>
          <BotonAtras />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('la búsqueda de pacientes queda en la URL (abrir una ficha y volver no la pierde)', () => {
  it('al abrir una ficha y volver atrás, conserva el texto y vuelve a pedir con el filtro', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return listaDePacientes([paciente()]);
      }),
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    );
    renderizarConAtras('/pacientes', ENFERMERO);

    await userEvent.type(await screen.findByLabelText(/Buscar/), 'a-01');
    await waitFor(() => expect(pedidos.at(-1)?.get('texto')).toBe('a-01'));
    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    await userEvent.click(await within(tabla).findByText('Benítez, Rosa'));
    expect(await screen.findByRole('heading', { name: 'Benítez, Rosa' })).toBeInTheDocument();

    const pedidosAntes = pedidos.length;
    await userEvent.click(screen.getByRole('button', { name: 'Atrás del navegador' }));

    expect(await screen.findByLabelText(/Buscar/)).toHaveValue('a-01');
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(pedidosAntes));
    // Todo pedido desde que volvió lleva el filtro: nunca se muestra la lista sin filtrar.
    expect(pedidos.slice(pedidosAntes).map((p) => p.get('texto'))).not.toContain('');
    expect(
      await within(await screen.findByRole('table', { name: 'Pacientes' })).findByText(
        'Benítez, Rosa',
      ),
    ).toBeInTheDocument();
  });

  it('lo mismo con la sala, el estado y la página elegidos: se restauran al entrar', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [paciente()],
          meta: { pagina: 2, porPagina: 20, total: 25, totalPaginas: 2 },
        });
      }),
    );
    renderizarApp('/pacientes?salaId=2&estado=EGRESADO&pagina=2', ENFERMERO);

    await screen.findByRole('table', { name: 'Pacientes' });
    expect(pedidos[0]?.get('salaId')).toBe('2');
    expect(pedidos[0]?.get('estado')).toBe('EGRESADO');
    expect(pedidos[0]?.get('pagina')).toBe('2');
    await waitFor(() => expect(screen.getByLabelText('Sala')).toHaveValue('2'));
    expect(screen.getByLabelText('Estado')).toHaveValue('EGRESADO');

    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    await waitFor(() => expect(pedidos.at(-1)?.get('pagina')).toBe('1'));
  });

  it('un estado vacío en la URL es "Todos", no el valor por defecto', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return listaDePacientes([paciente()]);
      }),
    );
    renderizarApp('/pacientes?estado=', ENFERMERO);

    await screen.findByRole('table', { name: 'Pacientes' });
    expect(screen.getByLabelText('Estado')).toHaveValue('');
    // El cliente no manda los filtros vacíos: sin "estado" el servidor devuelve todos.
    expect(pedidos[0]?.has('estado')).toBe(false);
  });

  it('la flecha "Volver" de la ficha vuelve a la búsqueda con sus filtros', async () => {
    servidor.use(
      http.get('*/api/pacientes', () => listaDePacientes([paciente()])),
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    );
    renderizarApp('/pacientes', ENFERMERO);

    await userEvent.type(await screen.findByLabelText(/Buscar/), 'a-01');
    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    await userEvent.click(await within(tabla).findByText('Benítez, Rosa'));
    await screen.findByRole('heading', { name: 'Benítez, Rosa' });
    await userEvent.click(screen.getByRole('link', { name: 'Volver' }));

    expect(await screen.findByLabelText(/Buscar/)).toHaveValue('a-01');
  });

  it('si se entra a la ficha sin pasar por la búsqueda, "Volver" lleva a Pacientes', async () => {
    servidor.use(
      http.get('*/api/pacientes', () => listaDePacientes([paciente()])),
      http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    );
    renderizarApp('/pacientes/7', ENFERMERO);

    await userEvent.click(await screen.findByRole('link', { name: 'Volver' }));
    expect(await screen.findByLabelText(/Buscar/)).toHaveValue('');
  });
});

describe('pacientes: cuando no hay nada que mostrar', () => {
  const sinResultadosSiHayTexto = http.get('*/api/pacientes', ({ request }) =>
    new URL(request.url).searchParams.get('texto')
      ? listaDePacientes([])
      : listaDePacientes([paciente()]),
  );
  const OPCIONES = { name: 'Qué puede hacer ahora' };

  it('con filtros dice por qué no hay nada y qué probar, y permite quitarlos', async () => {
    servidor.use(sinResultadosSiHayTexto);
    renderizarApp('/pacientes', ENFERMERO);

    await userEvent.type(await screen.findByLabelText(/Buscar/), 'Pérez');
    expect(
      await screen.findByText(
        'No hay pacientes internados que coincidan con «Pérez». Pruebe con otro apellido, DNI o cama, o cambie Estado a Todos.',
      ),
    ).toBeInTheDocument();
    const opciones = screen.getByRole('group', OPCIONES);
    // Enfermería no interna pacientes: no se le ofrece.
    expect(
      within(opciones).queryByRole('button', { name: 'Internar paciente' }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(opciones).getByRole('button', { name: 'Quitar filtros' }));

    expect(screen.getByLabelText(/Buscar/)).toHaveValue('');
    // El botón desaparece: el foco queda en el campo para buscar de nuevo.
    expect(screen.getByLabelText(/Buscar/)).toHaveFocus();
    const tabla = screen.getByRole('table', { name: 'Pacientes' });
    expect(await within(tabla).findByText('Benítez, Rosa')).toBeInTheDocument();
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();
  });

  it('nombra la sala elegida y el estado en el mensaje', async () => {
    servidor.use(http.get('*/api/pacientes', () => listaDePacientes([])));
    renderizarApp('/pacientes?salaId=2&texto=Pérez&estado=', ENFERMERO);

    expect(
      await screen.findByText(
        'No hay pacientes en Sala B – Traumatología que coincidan con «Pérez». Pruebe con otro apellido, DNI o cama, o elija otra sala.',
      ),
    ).toBeInTheDocument();
  });

  it('quitar los filtros también vuelve a Internados si se había elegido otro estado', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/pacientes', ({ request }) => {
        const parametros = new URL(request.url).searchParams;
        pedidos.push(parametros);
        return listaDePacientes(parametros.get('estado') === 'EGRESADO' ? [] : [paciente()]);
      }),
    );
    renderizarApp('/pacientes?estado=EGRESADO', ENFERMERO);

    expect(
      await screen.findByText('No hay pacientes egresados. Cambie Estado a Todos.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));

    expect(screen.getByLabelText('Estado')).toHaveValue('INTERNADO');
    await waitFor(() => expect(pedidos.at(-1)?.get('estado')).toBe('INTERNADO'));
  });

  it('quien puede internar pacientes lo tiene a mano también en la búsqueda sin resultados', async () => {
    servidor.use(sinResultadosSiHayTexto);
    renderizarApp('/pacientes?texto=zzz', MEDICO);

    const opciones = await screen.findByRole('group', OPCIONES);
    expect(within(opciones).getByRole('button', { name: 'Quitar filtros' })).toBeInTheDocument();
    await userEvent.click(within(opciones).getByRole('button', { name: 'Internar paciente' }));

    expect(await screen.findByRole('heading', { name: 'Internar paciente' })).toBeInTheDocument();
  });

  it('sin pacientes internados lo dice distinto, y quien puede internar tiene la acción', async () => {
    servidor.use(http.get('*/api/pacientes', () => listaDePacientes([])));
    renderizarApp('/pacientes', MEDICO);

    expect(
      await screen.findByText(
        'No hay pacientes internados. Cuando se interne uno, va a aparecer en esta lista.',
      ),
    ).toBeInTheDocument();
    const opciones = screen.getByRole('group', OPCIONES);
    expect(within(opciones).getByRole('button', { name: 'Internar paciente' })).toBeInTheDocument();
    // No hay filtros que quitar.
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).not.toBeInTheDocument();
  });

  it('sin pacientes internados, enfermería ve el mensaje y no una acción que no puede usar', async () => {
    servidor.use(http.get('*/api/pacientes', () => listaDePacientes([])));
    renderizarApp('/pacientes', ENFERMERO);

    expect(await screen.findByText(/No hay pacientes internados\./)).toBeInTheDocument();
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Internar paciente' })).not.toBeInTheDocument();
  });

  it('un fallo de carga no se lee como "no hay pacientes": avisa, deja reintentar y no muestra el vacío', async () => {
    let pedidos = 0;
    servidor.use(
      http.get('*/api/pacientes', () => {
        pedidos++;
        return pedidos === 1
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
              { status: 500 },
            )
          : listaDePacientes([paciente()]);
      }),
    );
    renderizarApp('/pacientes?texto=zzz', MEDICO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudo cargar la lista de pacientes/);
    expect(aviso).toHaveTextContent(/Error inesperado/);
    // Ni el mensaje de "sin resultados" ni sus acciones: no es que no haya pacientes.
    expect(screen.queryByText(/No hay pacientes/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();

    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

    const tabla = await screen.findByRole('table', { name: 'Pacientes' });
    expect(await within(tabla).findByText('Benítez, Rosa')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
