import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO } from '../../pruebas/datos';
import { listaDePacientes, paciente } from '../../pruebas/datosPacientes';
import {
  prepararSuministros,
  INSUMOS,
  suministro,
  validarRostro,
} from '../../pruebas/datosSuministros';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(prepararSuministros);
afterEach(() => vi.unstubAllEnvs());

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
    // El selector se busca por rol: la identificación del paciente también se llama "Paciente".
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Paciente' }),
      await screen.findByRole('option', { name: /Gómez, Luis/ }),
    );
    // Cambiar de paciente borra lo cargado: antes pregunta (UX-11) y recién al descartar lo borra.
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(screen.getByLabelText('Observaciones')).toHaveValue(''));
    expect(screen.queryByRole('list', { name: 'Insumos a registrar' })).not.toBeInTheDocument();
    // La identificación también cambia: no queda el paciente anterior a la vista.
    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    await waitFor(() => expect(ficha).toHaveTextContent('Gómez, Luis'));
    expect(ficha).not.toHaveTextContent('Benítez');
  });

  it('si no se puede cargar el catálogo de insumos, lo dice y deja reintentar', async () => {
    servidor.use(
      http.get('*/api/insumos', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudo cargar el catálogo de insumos/,
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('no deja confirmar sin insumos', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);
    expect(await screen.findByRole('button', { name: 'Confirmar con mi rostro' })).toBeDisabled();
  });
});

describe('registro de insumos · identificación del paciente y catálogo (F29 · F36)', () => {
  it('identifica al paciente con DNI, edad y cama, igual que al administrar', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    expect(ficha).toHaveTextContent('Benítez, Rosa');
    expect(ficha).toHaveTextContent('DNI 30111222');
    expect(ficha).toHaveTextContent(/\d+ años/);
    expect(ficha).toHaveTextContent(/Cama A.01 · Sala A – Neurorrehabilitación/);
    expect(within(ficha).getByText(/Cama A.01/).tagName).toBe('STRONG');
  });

  it('la identificación va debajo del selector de paciente y no queda el "Para …" al pie', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    const selector = screen.getByRole('combobox', { name: 'Paciente' });
    expect(selector.compareDocumentPosition(ficha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/^Para /)).not.toBeInTheDocument();
  });

  it('sin paciente elegido no muestra identificación', async () => {
    renderizarApp('/suministros/insumos', ENFERMERO);

    expect(await screen.findByRole('combobox', { name: 'Paciente' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Paciente' })).not.toBeInTheDocument();
  });

  it('el buscador del catálogo tiene lupa y filtra por nombre', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    const buscador = await screen.findByRole('searchbox', { name: 'Buscar insumo' });
    // La lupa es un adorno dentro del campo (decorativa: el nombre accesible lo da la etiqueta).
    expect(within(buscador.parentElement!).getByTestId('SearchIcon')).toBeInTheDocument();

    await userEvent.type(buscador, 'pañal');
    expect(screen.getByRole('button', { name: /Agregar Pañal talle M/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar Gasa estéril/ })).not.toBeInTheDocument();
  });

  it('en el catálogo el nombre va en el color del texto y la presentación en el secundario', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    const boton = await screen.findByRole('button', { name: /Agregar Pañal talle M/ });
    const nombre = within(boton).getByText('Pañal talle M');
    const presentacion = within(boton).getByText('x10');
    expect(nombre).toHaveStyle({ fontWeight: '700' });
    expect(getComputedStyle(nombre).color).toContain('--mui-palette-text-primary');
    expect(getComputedStyle(presentacion).color).toContain('--mui-palette-text-secondary');
    // Solo el "+" conserva el color de la marca.
    const mas = boton.querySelector('.MuiButton-startIcon');
    expect(getComputedStyle(mas!).color).toContain('--mui-palette-primary-main');
  });

  it('en la lista de cantidades la unidad va en el color secundario, bajo el nombre', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    const lista = screen.getByRole('list', { name: 'Insumos a registrar' });
    const item = within(lista).getByRole('listitem');
    const unidad = within(item).getByText('unidad');
    expect(getComputedStyle(unidad).color).toContain('--mui-palette-text-secondary');
    expect(within(item).getByText('Gasa estéril')).toHaveStyle({ fontWeight: '700' });
  });
});

describe('registro de insumos · estados y confirmación (UX-05 · UX-07 · UX-08)', () => {
  it('mientras llega el paciente lo dice, y después muestra su identificación', async () => {
    let liberar!: () => void;
    const espera = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/pacientes/7', async () => {
        await espera;
        return HttpResponse.json({ data: paciente() });
      }),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    expect(await screen.findByText('Cargando el paciente…')).toBeInTheDocument();
    liberar();
    expect(await screen.findByRole('region', { name: 'Paciente' })).toBeInTheDocument();
    expect(screen.queryByText('Cargando el paciente…')).not.toBeInTheDocument();
  });

  it('si el paciente no se puede cargar lo dice y deja reintentar', async () => {
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
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo cargar el paciente/);
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Paciente' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si la búsqueda no coincide con ningún insumo dice qué hacer', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.type(
      await screen.findByRole('searchbox', { name: 'Buscar insumo' }),
      'Jeringa',
    );

    expect(
      await screen.findByText(
        'Ningún insumo coincide con «Jeringa». Revise el nombre o pida al administrador que lo agregue al catálogo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument();
  });

  it('si el catálogo está vacío lo dice, en vez de dejar un hueco', async () => {
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [] })));
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    expect(
      await screen.findByText(
        'El catálogo no tiene insumos para registrar. Pida al administrador que los agregue.',
      ),
    ).toBeInTheDocument();
  });

  it('el diálogo de confirmación muestra qué se confirma: insumos, cantidades y paciente', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: /Agregar Pañal talle M/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));

    const dialogo = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(dialogo).toHaveTextContent(/Gasa estéril.*2/);
    expect(dialogo).toHaveTextContent(/Pañal talle M.*1/);
    expect(dialogo).toHaveTextContent('Benítez, Rosa');
    expect(dialogo).toHaveTextContent('DNI 30111222');
    // La cama con el guion que no corta (F3).
    expect(dialogo).toHaveTextContent(`Cama A${String.fromCharCode(0x2011)}01`);
  });

  it('un error del registro no queda a la vista al cambiar de paciente', async () => {
    const otro = paciente({ id: 8, dni: '27444555', nombre: 'Luis', apellido: 'Gómez' });
    validarRostro();
    servidor.use(
      http.get('*/api/pacientes', () => listaDePacientes([paciente(), otro])),
      http.get('*/api/pacientes/8', () => HttpResponse.json({ data: otro })),
      http.post('*/api/suministros/insumos', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/El servidor tuvo un problema/);

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Paciente' }),
      await screen.findByRole('option', { name: /Gómez, Luis/ }),
    );
    // Los insumos que no se llegaron a registrar siguen cargados: cambiar de paciente pregunta.
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('registro de insumos · cantidades (UX-09)', () => {
  const agregarGasa = async () => {
    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    return screen.getByLabelText('Cantidad de Gasa estéril');
  };
  const confirmar = () => screen.getByRole('button', { name: 'Confirmar con mi rostro' });
  const ERROR = 'Ingrese una cantidad de 1 o más';

  it('al borrar la cantidad para escribir otra no queda pegado el 1 (de 3 a 5 es 5, no 15)', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);
    const campo = await agregarGasa();

    await userEvent.clear(campo);
    // Mientras se escribe no se corrige nada ni se marca error.
    expect(campo).toHaveValue(null);
    expect(screen.queryByText(ERROR)).not.toBeInTheDocument();
    await userEvent.type(campo, '5');
    expect(campo).toHaveValue(5);
    await userEvent.tab();

    expect(campo).toHaveValue(5);
    expect(screen.queryByText(ERROR)).not.toBeInTheDocument();
    expect(confirmar()).toBeEnabled();
  });

  it('una cantidad vacía muestra el error junto al campo y no deja confirmar', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);
    const campo = await agregarGasa();

    await userEvent.clear(campo);
    await userEvent.tab();

    expect(screen.getByText(ERROR)).toBeVisible();
    expect(campo).toBeInvalid();
    expect(campo).toHaveAccessibleDescription(ERROR);
    expect(confirmar()).toBeDisabled();

    // Corregirla saca el error y habilita la confirmación.
    await userEvent.type(campo, '2');
    await userEvent.tab();
    expect(screen.queryByText(ERROR)).not.toBeInTheDocument();
    expect(campo).toHaveValue(2);
    expect(confirmar()).toBeEnabled();
  });

  it('una cantidad en cero también es un error', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);
    const campo = await agregarGasa();

    await userEvent.clear(campo);
    await userEvent.type(campo, '0');
    await userEvent.tab();

    expect(screen.getByText(ERROR)).toBeVisible();
    expect(confirmar()).toBeDisabled();
  });

  it('con un insumo mal cargado no se confirma aunque haya otro bien cargado', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);
    const campo = await agregarGasa();
    await userEvent.click(screen.getByRole('button', { name: /Agregar Pañal talle M/ }));

    await userEvent.clear(campo);
    await userEvent.tab();

    expect(screen.getAllByText(ERROR)).toHaveLength(1);
    expect(confirmar()).toBeDisabled();
  });

  it('los botones de sumar y restar siguen igual: no bajan de 1 y sacan el error', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);
    const campo = await agregarGasa();

    await userEvent.click(screen.getByRole('button', { name: 'Sumar uno a Gasa estéril' }));
    expect(campo).toHaveValue(2);
    await userEvent.click(screen.getByRole('button', { name: 'Restar uno a Gasa estéril' }));
    await userEvent.click(screen.getByRole('button', { name: 'Restar uno a Gasa estéril' }));
    expect(campo).toHaveValue(1);

    await userEvent.clear(campo);
    await userEvent.tab();
    expect(screen.getByText(ERROR)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Sumar uno a Gasa estéril' }));
    expect(campo).toHaveValue(1);
    expect(screen.queryByText(ERROR)).not.toBeInTheDocument();
    expect(confirmar()).toBeEnabled();
  });
});

describe('registro de insumos · botonera y campos numéricos (F31 · UX-19)', () => {
  const botonera = () =>
    within(screen.getByRole('group', { name: 'Acciones del formulario' })).getAllByRole('button');

  it('Confirmar con mi rostro, la acción principal, está en la botonera del formulario', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    expect(botonera().at(-1)).toHaveAccessibleName('Confirmar con mi rostro');
    expect(botonera().at(-1)).toBeEnabled();
  });

  it('sin paciente elegido el botón deshabilitado también va en la botonera', async () => {
    renderizarApp('/suministros/insumos', ENFERMERO);

    await screen.findByRole('combobox', { name: 'Paciente' });
    expect(botonera().map((b) => b.textContent)).toEqual(['Confirmar con mi rostro']);
    expect(botonera().at(-1)).toBeDisabled();
  });

  it('la rueda del mouse no cambia la cantidad de un insumo: el campo suelta el foco', async () => {
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    const cantidad = screen.getByLabelText('Cantidad de Gasa estéril');
    cantidad.focus();
    expect(cantidad).toHaveFocus();

    fireEvent.wheel(cantidad, { deltaY: -100 });

    expect(cantidad).not.toHaveFocus();
    expect(cantidad).toHaveValue(1);
  });
});

describe('registro de insumos · tres validaciones fallidas (F4)', () => {
  it('dice claramente que los insumos NO se registraron', async () => {
    const registrar = vi.fn(() => HttpResponse.json({ data: suministro() }, { status: 201 }));
    servidor.use(
      http.post('*/api/biometria/validar', () =>
        HttpResponse.json({ data: { valido: false, intentosRestantes: 0, cancelada: true } }),
      ),
      http.post('*/api/suministros/insumos', registrar),
    );
    renderizarApp('/suministros/insumos?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar Gasa estéril/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    const rostro = screen.getByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(await within(rostro).findByRole('alert')).toHaveTextContent(
      'No se registraron los insumos. Los tres intentos fallidos quedaron registrados y se avisó al administrador.',
    );
    expect(registrar).not.toHaveBeenCalled();
  });
});
