import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import { prepararSuministros, suministro, validarRostro } from '../../pruebas/datosSuministros';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(prepararSuministros);
afterEach(() => vi.unstubAllEnvs());

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

describe('el historial de suministros recuerda lo que se filtró (queda en la URL)', () => {
  const lista = (data: ReturnType<typeof suministro>[]) =>
    HttpResponse.json({
      data,
      meta: { pagina: 1, porPagina: 20, total: data.length, totalPaginas: data.length ? 1 : 0 },
    });
  const OPCIONES = { name: 'Qué puede hacer ahora' };

  it('restaura de la URL el paciente, las fechas, el tipo, el responsable y la página, y los pide a la API', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/suministros', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return lista([suministro()]);
      }),
    );
    renderizarApp(
      '/suministros?pacienteId=7&desde=2026-10-01&hasta=2026-10-05&tipoInsumo=MEDICAMENTO&usuarioId=3&pagina=2',
      ENFERMERO,
    );

    await screen.findByRole('table', { name: 'Suministros' });
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-05');
    expect(screen.getByLabelText('Tipo')).toHaveValue('MEDICAMENTO');
    await waitFor(() => expect(screen.getByLabelText('Paciente')).toHaveValue('7'));
    await waitFor(() => expect(screen.getByLabelText('Responsable')).toHaveValue('3'));
    expect(pedidos[0]?.get('pacienteId')).toBe('7');
    expect(pedidos[0]?.get('desde')).toBe('2026-10-01T00:00:00-03:00');
    expect(pedidos[0]?.get('hasta')).toBe('2026-10-05T23:59:59.999-03:00');
    expect(pedidos[0]?.get('tipoInsumo')).toBe('MEDICAMENTO');
    expect(pedidos[0]?.get('usuarioId')).toBe('3');
    expect(pedidos[0]?.get('pagina')).toBe('2');
  });

  it('con filtros dice por qué no hay nada y qué probar, y permite quitarlos', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/suministros', ({ request }) => {
        const parametros = new URL(request.url).searchParams;
        pedidos.push(parametros);
        return lista(parametros.has('tipoInsumo') || parametros.has('desde') ? [] : [suministro()]);
      }),
    );
    renderizarApp('/suministros?tipoInsumo=MEDICAMENTO&desde=2026-10-01', ENFERMERO);

    expect(
      await screen.findByText(
        'No hay suministros de medicamentos desde el 01/10/2026. Amplíe las fechas, o cambie Tipo a Todos.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('group', OPCIONES)).getByRole('button', { name: 'Quitar filtros' }),
    );

    expect(screen.getByLabelText('Tipo')).toHaveValue('');
    expect(screen.getByLabelText('Desde')).toHaveValue('');
    const tabla = screen.getByRole('table', { name: 'Suministros' });
    expect(await within(tabla).findByText(/Paracetamol × 500 mg/)).toBeInTheDocument();
    expect(pedidos.at(-1)?.has('tipoInsumo')).toBe(false);
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();
  });

  it('nombra al paciente, las fechas y al responsable en el mensaje', async () => {
    servidor.use(http.get('*/api/suministros', () => lista([])));
    renderizarApp(
      '/suministros?pacienteId=7&desde=2026-10-01&hasta=2026-10-05&usuarioId=3',
      ENFERMERO,
    );

    expect(
      await screen.findByText(
        'No hay suministros del paciente elegido entre el 01/10/2026 y el 05/10/2026 registrados por Acosta, Sofía. Elija otro paciente, amplíe las fechas, o elija otro responsable.',
      ),
    ).toBeInTheDocument();
  });

  it('sin ningún suministro registrado lo dice distinto, sin ofrecer quitar filtros que no hay', async () => {
    servidor.use(http.get('*/api/suministros', () => lista([])));
    renderizarApp('/suministros', ENFERMERO);

    expect(
      await screen.findByText(
        'Todavía no se registró ningún suministro. Aparecerán aquí cuando se administre un medicamento o se registren insumos.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).not.toBeInTheDocument();
  });

  it('un fallo de carga no se lee como "no hay suministros": avisa, deja reintentar y no muestra el vacío', async () => {
    let pedidos = 0;
    servidor.use(
      http.get('*/api/suministros', () => {
        pedidos++;
        return pedidos === 1
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
              { status: 500 },
            )
          : lista([suministro()]);
      }),
    );
    renderizarApp('/suministros?tipoInsumo=MEDICAMENTO', ENFERMERO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudo cargar el historial de suministros/);
    expect(aviso).toHaveTextContent(/Error inesperado/);
    expect(screen.queryByText(/No hay suministros|Todavía no se registró/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();

    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    expect(await within(tabla).findByText(/Paracetamol × 500 mg/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('el historial de suministros en tablet vertical (F28 · F32 · F48)', () => {
  /** Guion y espacio que no permiten cortar el renglón. */
  const GUION = String.fromCharCode(0x2011);
  const NBSP = String.fromCharCode(160);
  const lista = (data: ReturnType<typeof suministro>[]) =>
    HttpResponse.json({
      data,
      meta: { pagina: 1, porPagina: 20, total: data.length, totalPaginas: data.length ? 1 : 0 },
    });
  // 11:00 UTC son las 08:00 en Argentina.
  const delMedio = () => suministro({ fechaHora: '2026-10-07T11:00:00.000Z' });

  it('los filtros van en una región de búsqueda con nombre (grilla de dos columnas desde sm)', async () => {
    servidor.use(http.get('*/api/suministros', () => lista([delMedio()])));
    renderizarApp('/suministros', ENFERMERO);

    const filtros = await screen.findByRole('search', { name: 'Filtros' });
    for (const campo of ['Paciente', 'Desde', 'Hasta', 'Tipo', 'Responsable']) {
      expect(within(filtros).getByLabelText(campo)).toBeInTheDocument();
    }
  });

  it('los encabezados caben en un renglón', async () => {
    servidor.use(http.get('*/api/suministros', () => lista([delMedio()])));
    renderizarApp('/suministros', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    const encabezados = within(tabla)
      .getAllByRole('columnheader')
      .map((e) => e.textContent?.trim());
    expect(encabezados.slice(0, 5)).toEqual([
      'Fecha y hora',
      'Paciente',
      'Detalle',
      'Registró',
      'Estado',
    ]);
  });

  it('el paciente va en negrita con su cama sin partir, y la fila dice qué abre', async () => {
    servidor.use(http.get('*/api/suministros', () => lista([delMedio()])));
    renderizarApp('/suministros', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    const fila = await within(tabla).findByRole('row', {
      name: 'Abrir el registro de 07/10 08:00 de Benítez, Rosa',
    });
    const paciente = within(fila).getByText(`Benítez, Rosa · A${GUION}01`);
    expect(paciente.tagName).toBe('STRONG');
  });

  it('la cantidad y la medida de cada insumo no se parten en dos renglones', async () => {
    servidor.use(
      http.get('*/api/suministros', () =>
        lista([
          suministro({
            tipo: 'INSUMOS',
            detalles: [
              {
                insumoId: 20,
                insumo: 'Gasa estéril 10 x 10 cm',
                tipoInsumo: 'INSUMO',
                cantidad: 2,
                unidad: 'unidad',
              },
            ],
          }),
        ]),
      ),
    );
    renderizarApp('/suministros', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    const detalle = await within(tabla).findByText(/Gasa estéril/);
    expect(detalle.textContent).toBe(`Gasa estéril 10${NBSP}x${NBSP}10${NBSP}cm × 2${NBSP}unidad`);
  });

  it('mientras se filtra, las filas anteriores se ven atenuadas y el listado figura ocupado', async () => {
    let liberar!: () => void;
    const respuestaLenta = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/suministros', async ({ request }) => {
        if (new URL(request.url).searchParams.has('tipoInsumo')) await respuestaLenta;
        return lista([delMedio()]);
      }),
    );
    renderizarApp('/suministros', ENFERMERO);

    const tabla = await screen.findByRole('table', { name: 'Suministros' });
    await within(tabla).findByText(/Paracetamol × 500 mg/);
    const contenedor = tabla.closest('[aria-busy]')!;
    expect(contenedor).toHaveAttribute('aria-busy', 'false');

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Medicamentos');

    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'true'));
    expect(contenedor).toHaveStyle({ opacity: '0.5' });
    expect(within(tabla).getByText(/Paracetamol × 500 mg/)).toBeInTheDocument();

    liberar();
    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'false'));
  });
});
