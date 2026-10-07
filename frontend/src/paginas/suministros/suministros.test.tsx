import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Insumo, Prescripcion, Suministro } from '../../api/tipos';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import { listaDePacientes, paciente } from '../../pruebas/datosPacientes';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

/** Momento relativo a ahora, en ISO: las pantallas calculan "toca ahora", "atrasada"… */
const enMinutos = (minutos: number) => new Date(Date.now() + minutos * 60_000).toISOString();

const vigente: Prescripcion = {
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
  observaciones: null,
  estado: 'VIGENTE',
  motivoCambioEstado: null,
  prescriptor: 'Ferreyra, Martín',
  creadoEn: '2026-10-07T11:00:00.000Z',
  proximaToma: enMinutos(10),
  ultimasAdministraciones: [],
};

const otraVigente = (
  id: number,
  nombre: string,
  dosis: number,
  extra: Partial<Prescripcion> = {},
): Prescripcion => ({
  ...vigente,
  id,
  medicamento: { ...vigente.medicamento, id, nombre },
  dosis,
  ...extra,
});

const conPrescripciones = (...prescripciones: Prescripcion[]) =>
  servidor.use(
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: prescripciones })),
  );

const INSUMOS: Insumo[] = [
  {
    id: 20,
    nombre: 'Gasa estéril',
    tipo: 'INSUMO',
    unidadMedida: 'unidad',
    presentacion: '',
    activo: true,
  },
  {
    id: 21,
    nombre: 'Pañal talle M',
    tipo: 'INSUMO',
    unidadMedida: 'unidad',
    presentacion: 'x10',
    activo: true,
  },
];

const suministro = (extra: Partial<Suministro> = {}): Suministro => ({
  id: 90,
  tipo: 'MEDICAMENTO',
  fechaHora: new Date(Date.now() - 3_600_000).toISOString(),
  paciente: { id: 7, apellido: 'Benítez', nombre: 'Rosa', dni: '30111222', cama: 'A-01' },
  usuario: { id: 3, nombre: 'Acosta, Sofía' },
  prescripcion: {
    id: 40,
    medicamento: 'Paracetamol',
    dosis: 500,
    unidadDosis: 'mg',
    frecuenciaHoras: 8,
  },
  tomaProgramada: new Date(Date.now() - 3_600_000).toISOString(),
  detalles: [
    { insumoId: 1, insumo: 'Paracetamol', tipoInsumo: 'MEDICAMENTO', cantidad: 500, unidad: 'mg' },
  ],
  observaciones: null,
  validadoBiometricamente: true,
  corregido: false,
  motivoCorreccion: null,
  corregidoEn: null,
  corregidoPor: null,
  corregibleHasta: new Date(Date.now() + 23 * 3_600_000).toISOString(),
  ...extra,
});

const validarRostro = () =>
  servidor.use(
    http.post('*/api/biometria/validar', () =>
      HttpResponse.json({ data: { valido: true, validacionToken: 'tok-ok', similitud: 0.9 } }),
    ),
  );

beforeEach(() => {
  vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
  servidor.use(
    http.get('*/api/pacientes', () => listaDePacientes([paciente()])),
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [vigente] })),
    http.get('*/api/insumos', () => HttpResponse.json({ data: INSUMOS })),
    http.get('*/api/suministros/responsables', () =>
      HttpResponse.json({ data: [{ id: 3, nombre: 'Acosta, Sofía' }] }),
    ),
  );
});
afterEach(() => vi.unstubAllEnvs());

describe('administración de medicamento (T413 · CU20)', () => {
  it('elige la prescripción, confirma con el rostro y registra la toma', async () => {
    let enviado: Record<string, unknown> | undefined;
    validarRostro();
    servidor.use(
      http.post('*/api/suministros/medicamentos', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: suministro() }, { status: 201 });
      }),
    );
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    expect(await screen.findByText(/Benítez, Rosa/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    expect(screen.getByLabelText(/^Cantidad/)).toHaveValue(500);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      /Se registró Paracetamol 500 mg a Benítez, Rosa/,
    );
    expect(enviado).toMatchObject({
      pacienteId: 7,
      prescripcionId: 40,
      cantidad: 500,
      validacionToken: 'tok-ok',
    });
  });

  it('permite elegir el paciente cuando no viene indicado', async () => {
    renderizarApp('/suministros/medicamento', ENFERMERO);

    await screen.findByRole('option', { name: /Benítez, Rosa/ });
    // Sin paciente elegido no hay nada que cargar ni ningún error que mostrar.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText('Paciente'),
      screen.getByRole('option', { name: /Benítez, Rosa/ }),
    );

    expect(await screen.findByRole('button', { name: /Paracetamol 500\smg/ })).toBeInTheDocument();
  });

  it('si se cancela la validación facial no registra nada', async () => {
    const registrar = vi.fn(() => HttpResponse.json({ data: suministro() }, { status: 201 }));
    servidor.use(http.post('*/api/suministros/medicamentos', registrar));
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    const dialogo = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(registrar).not.toHaveBeenCalled();
  });

  it('muestra el error de la regla de negocio que devuelve el servidor', async () => {
    validarRostro();
    servidor.use(
      http.post('*/api/suministros/medicamentos', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'SIN_PRESCRIPCION_VIGENTE',
              mensaje: 'No se puede registrar el medicamento: la prescripción está suspendida',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/prescripción está suspendida/);
  });

  it('identifica al paciente con DNI, edad y cama (la cara valida a quien registra, no al paciente)', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    expect(ficha).toHaveTextContent('Benítez, Rosa');
    expect(ficha).toHaveTextContent('DNI 30111222');
    expect(ficha).toHaveTextContent(/\d+ años/);
    expect(ficha).toHaveTextContent('Cama A-01');
  });

  it('cada prescripción dice si la toma toca ahora, está atrasada, ya se dio o cuánto falta', async () => {
    conPrescripciones(
      vigente,
      otraVigente(41, 'Enalapril', 10, { proximaToma: enMinutos(-20) }),
      otraVigente(42, 'Omeprazol', 20, { proximaToma: enMinutos(185) }),
      otraVigente(43, 'Clonazepam', 0.5, {
        proximaToma: enMinutos(470),
        ultimasAdministraciones: [
          { id: 1, fechaHora: enMinutos(-10), cantidad: 0.5, usuario: 'Acosta, Sofía' },
        ],
      }),
    );
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    expect(await screen.findByRole('button', { name: /Paracetamol/ })).toHaveTextContent(
      'Toca ahora',
    );
    expect(screen.getByRole('button', { name: /Enalapril/ })).toHaveTextContent('Atrasada 20 min');
    expect(screen.getByRole('button', { name: /Omeprazol/ })).toHaveTextContent('Faltan 3 h 5 min');
    expect(screen.getByRole('button', { name: /Clonazepam/ })).toHaveTextContent(
      'Ya se dio hace 10 min',
    );
  });

  it('antes de confirmar muestra un resumen para revisar, también en la validación facial', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    const resumen = screen.getByRole('region', { name: 'Revise antes de confirmar' });
    expect(resumen).toHaveTextContent('Benítez, Rosa');
    expect(resumen).toHaveTextContent('Cama A-01');
    expect(resumen).toHaveTextContent('Paracetamol 500 mg');
    expect(resumen).toHaveTextContent('Oral');
    expect(resumen).toHaveTextContent(/Toma de las \d\d:\d\d/);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    const dialogo = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(dialogo).toHaveTextContent('Benítez, Rosa');
    expect(dialogo).toHaveTextContent('Cama A-01');
    expect(dialogo).toHaveTextContent('Paracetamol 500 mg');
  });

  it('avisa si la cantidad es distinta de la prescripta, sin impedir registrarla', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    const cantidad = screen.getByLabelText(/^Cantidad/);
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, '1000');

    expect(screen.getByText(/1000 mg es distinta de la dosis prescripta \(500 mg\)/)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Revise antes de confirmar' })).toHaveTextContent(
      /Distinta de la prescripta/,
    );
    expect(screen.getByRole('button', { name: 'Confirmar con mi rostro' })).toBeEnabled();
  });

  it('avisa si todavía falta para la toma', async () => {
    conPrescripciones({ ...vigente, proximaToma: enMinutos(185) });
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));

    expect(screen.getByText(/Faltan 3 h 5 min para la toma de las \d\d:\d\d/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar con mi rostro' })).toBeEnabled();
  });

  it('si la toma ya se dio, lo dice y pide confirmar que corresponde otra antes de registrar', async () => {
    conPrescripciones({
      ...vigente,
      proximaToma: enMinutos(470),
      ultimasAdministraciones: [
        { id: 1, fechaHora: enMinutos(-10), cantidad: 500, usuario: 'Acosta, Sofía' },
      ],
    });
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));

    expect(screen.getByText(/ya se dio a las \d\d:\d\d \(Acosta, Sofía\)/)).toBeVisible();
    const confirmar = screen.getByRole('button', { name: 'Confirmar con mi rostro' });
    expect(confirmar).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /Corresponde dar otra toma/ }));
    expect(confirmar).toBeEnabled();
  });

  it('si no se pudieron cargar las prescripciones lo dice (no "no tiene") y deja reintentar', async () => {
    let fallar = true;
    servidor.use(
      http.get('*/api/pacientes/7/prescripciones', () =>
        fallar
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
              { status: 500 },
            )
          : HttpResponse.json({ data: [vigente] }),
      ),
    );
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudieron cargar las prescripciones/,
    );
    expect(screen.queryByText(/no tiene prescripciones vigentes/)).not.toBeInTheDocument();
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /Paracetamol 500\smg/ })).toBeInTheDocument();
  });

  it('sin respuesta del servidor al registrar, pide revisar el historial antes de reintentar', async () => {
    validarRostro();
    servidor.use(http.post('*/api/suministros/medicamentos', () => HttpResponse.error()));
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/no se sabe si quedó registrada/);
    expect(alerta).toHaveTextContent(/revise el historial/);
    expect(within(alerta).getByRole('button', { name: 'Ver el historial' })).toBeInTheDocument();
  });

  it('al elegir otra prescripción no arrastra las observaciones de la anterior', async () => {
    conPrescripciones(vigente, otraVigente(41, 'Enalapril', 10));
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol/ }));
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Rechazó el desayuno');
    await userEvent.click(screen.getByRole('button', { name: /Enalapril/ }));

    expect(screen.getByLabelText('Observaciones')).toHaveValue('');
    expect(screen.getByLabelText(/^Cantidad/)).toHaveValue(10);
  });
});

describe('registro de insumos (T414 · CU21)', () => {
  it('carga varios insumos con sus cantidades y los registra en un solo movimiento', async () => {
    let enviado: Record<string, unknown> | undefined;
    validarRostro();
    servidor.use(
      http.post('*/api/suministros/insumos', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        // La respuesta refleja los insumos enviados, como hace el backend.
        const detalles = (enviado.items as { insumoId: number; cantidad: number }[]).map((i) => ({
          insumoId: i.insumoId,
          insumo: INSUMOS.find((x) => x.id === i.insumoId)!.nombre,
          tipoInsumo: 'INSUMO' as const,
          cantidad: i.cantidad,
          unidad: 'unidad',
        }));
        return HttpResponse.json(
          { data: suministro({ tipo: 'INSUMOS', prescripcion: null, detalles }) },
          { status: 201 },
        );
      }),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: /Agregar Pañal talle M/ }));
    const lista = screen.getByRole('list', { name: 'Insumos a registrar' });
    expect(within(lista).getByLabelText('Cantidad de Gasa estéril')).toHaveValue(2);
    await userEvent.click(within(lista).getByRole('button', { name: 'Sumar uno a Pañal talle M' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/Se registraron 2 insumos/);
    expect(enviado).toMatchObject({
      pacienteId: 7,
      items: [
        { insumoId: 20, cantidad: 2 },
        { insumoId: 21, cantidad: 2 },
      ],
      validacionToken: 'tok-ok',
    });
  });

  it('al cambiar de paciente no arrastra los insumos ni las observaciones del anterior', async () => {
    const otro = paciente({ id: 8, dni: '27444555', nombre: 'Luis', apellido: 'Gómez' });
    servidor.use(
      http.get('*/api/pacientes', () => listaDePacientes([paciente(), otro])),
      http.get('*/api/pacientes/8', () => HttpResponse.json({ data: otro })),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Curación de escara');
    await userEvent.selectOptions(
      screen.getByLabelText('Paciente'),
      await screen.findByRole('option', { name: /Gómez, Luis/ }),
    );

    await waitFor(() => expect(screen.getByLabelText('Observaciones')).toHaveValue(''));
    expect(screen.queryByRole('list', { name: 'Insumos a registrar' })).not.toBeInTheDocument();
  });

  it('no deja confirmar sin insumos', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);
    expect(await screen.findByRole('button', { name: 'Confirmar con mi rostro' })).toBeDisabled();
  });
});

describe('historial y corrección de suministros (T415 · T416 · CU22 · CU23)', () => {
  it('lista los suministros y filtra por tipo y responsable', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/suministros', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [suministro()],
          meta: { pagina: 1, porPagina: 20, total: 1, totalPaginas: 1 },
        });
      }),
    );
    renderizarApp('/suministros', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    expect(await within(tabla).findByText(/Paracetamol × 500 mg/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Medicamentos');
    await screen.findByRole('option', { name: 'Acosta, Sofía' });
    await userEvent.selectOptions(screen.getByLabelText('Responsable'), 'Acosta, Sofía');

    await waitFor(() => {
      expect(pedidos.at(-1)?.get('tipoInsumo')).toBe('MEDICAMENTO');
      expect(pedidos.at(-1)?.get('usuarioId')).toBe('3');
    });
  });

  it('corrige la cantidad de una administración dentro de las 24 horas, con motivo y rostro', async () => {
    let enviado: Record<string, unknown> | undefined;
    validarRostro();
    servidor.use(
      http.get('*/api/suministros', () =>
        HttpResponse.json({
          data: [suministro()],
          meta: { pagina: 1, porPagina: 20, total: 1, totalPaginas: 1 },
        }),
      ),
      http.patch('*/api/suministros/90', async ({ request }) => {
        enviado = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          data: suministro({
            corregido: true,
            motivoCorreccion: 'Media dosis',
            corregidoPor: 'Acosta, Sofía',
            detalles: [
              {
                insumoId: 1,
                insumo: 'Paracetamol',
                tipoInsumo: 'MEDICAMENTO',
                cantidad: 250,
                unidad: 'mg',
              },
            ],
          }),
        });
      }),
    );
    renderizarApp('/suministros', ENFERMERO);

    await userEvent.click(await screen.findByText(/Paracetamol × 500 mg/));
    const dialogo = screen.getByRole('dialog', { name: /Suministro/ });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Corregir' }));
    const cantidad = within(dialogo).getByLabelText(/^Cantidad/);
    await userEvent.clear(cantidad);
    await userEvent.type(cantidad, '250');
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'Media dosis');
    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Confirmar corrección con mi rostro' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await within(dialogo).findByText(/Corregido por Acosta, Sofía/)).toBeInTheDocument();
    expect(enviado).toEqual({ cantidad: 250, motivo: 'Media dosis', validacionToken: 'tok-ok' });
  });

  it('pasadas las 24 horas ya no ofrece corregir', async () => {
    servidor.use(
      http.get('*/api/suministros', () =>
        HttpResponse.json({
          data: [suministro({ corregibleHasta: new Date(Date.now() - 1000).toISOString() })],
          meta: { pagina: 1, porPagina: 20, total: 1, totalPaginas: 1 },
        }),
      ),
    );
    renderizarApp('/suministros', ENFERMERO);

    await userEvent.click(await screen.findByText(/Paracetamol × 500 mg/));
    const dialogo = screen.getByRole('dialog', { name: /Suministro/ });
    expect(within(dialogo).queryByRole('button', { name: 'Corregir' })).not.toBeInTheDocument();
    expect(within(dialogo).getByText(/plazo de corrección venció/)).toBeInTheDocument();
  });

  it('el médico consulta el historial pero no registra suministros', async () => {
    servidor.use(
      http.get('*/api/suministros', () =>
        HttpResponse.json({
          data: [],
          meta: { pagina: 1, porPagina: 20, total: 0, totalPaginas: 0 },
        }),
      ),
    );
    renderizarApp('/suministros', MEDICO);
    await screen.findByRole('table', { name: 'Suministros' });
    expect(
      screen.queryByRole('button', { name: /Administrar medicamento/ }),
    ).not.toBeInTheDocument();
  });
});
