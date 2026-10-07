import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO } from '../../pruebas/datos';
import { HISTORIAL, listaDePacientes, paciente } from '../../pruebas/datosPacientes';
import { simularRecordatorios } from '../../pruebas/datosRecordatorios';
import {
  prepararSuministros,
  conPrescripciones,
  enMinutos,
  otraVigente,
  suministro,
  validarRostro,
  vigente,
} from '../../pruebas/datosSuministros';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { formatearHora } from '../../utilidades/formato';

beforeEach(prepararSuministros);
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

    // El nombre también está en el selector (como opción): se mira la identidad del paciente.
    expect(await screen.findByRole('region', { name: 'Paciente' })).toHaveTextContent(
      'Benítez, Rosa',
    );
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

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/prescripción está suspendida/);
    // El servidor respondió que no: no hay duda de que no se registró.
    expect(alerta).not.toHaveTextContent(/no se sabe/i);
  });

  it('si no se puede cargar la lista de pacientes, el selector lo dice', async () => {
    servidor.use(
      http.get('*/api/pacientes', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/suministros/medicamento', ENFERMERO);

    await waitFor(() =>
      expect(screen.getByLabelText('Paciente')).toHaveAccessibleDescription(
        /No se pudo cargar la lista de pacientes/,
      ),
    );
  });

  it('identifica al paciente con DNI, edad y cama (el rostro valida a quien registra, no al paciente)', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    const ficha = await screen.findByRole('region', { name: 'Paciente' });
    expect(ficha).toHaveTextContent('Benítez, Rosa');
    expect(ficha).toHaveTextContent('DNI 30111222');
    expect(ficha).toHaveTextContent(/\d+ años/);
    expect(ficha).toHaveTextContent(/Cama A.01/);
  });

  it('cada prescripción dice si la toma toca ahora, está atrasada, ya se dio o cuánto falta', async () => {
    const hace10 = enMinutos(-10);
    conPrescripciones(
      vigente,
      otraVigente(41, 'Enalapril', 10, { proximaToma: enMinutos(-20) }),
      otraVigente(42, 'Omeprazol', 20, { proximaToma: enMinutos(185) }),
      otraVigente(43, 'Clonazepam', 0.5, {
        proximaToma: enMinutos(470),
        ultimasAdministraciones: [
          { id: 1, fechaHora: hace10, cantidad: 0.5, usuario: 'Acosta, Sofía' },
        ],
      }),
    );
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    expect(await screen.findByRole('button', { name: /Paracetamol/ })).toHaveTextContent(
      'Toca ahora',
    );
    expect(screen.getByRole('button', { name: /Enalapril/ })).toHaveTextContent('Atrasada 20 min');
    expect(screen.getByRole('button', { name: /Omeprazol/ })).toHaveTextContent('Faltan 3 h 5 min');
    // Hora absoluta, igual que el aviso al elegirla: la hora relativa no se puede cotejar con el historial.
    const dada = screen.getByRole('button', { name: /Clonazepam/ });
    expect(dada).toHaveTextContent(`Ya se dio a las ${formatearHora(hace10)}`);
    expect(dada).not.toHaveTextContent('hace');
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
    expect(alerta).toHaveTextContent('Benítez, Rosa (cama A-01)');
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

/** Chip de estado de la toma dentro de la tarjeta de una prescripción. */
const chipDe = (prescripcion: RegExp, texto: string | RegExp) =>
  within(screen.getByRole('button', { name: prescripcion }))
    .getByText(texto)
    .closest('.MuiChip-root') as HTMLElement;

const tarjetaDe = (prescripcion: RegExp) =>
  screen.getByRole('button', { name: prescripcion }).closest('.MuiCard-root') as HTMLElement;

/** CSS que emotion generó para las clases del elemento (jsdom no resuelve var() al calcular estilos). */
const cssDe = (el: Element) => {
  const css = [...document.querySelectorAll('style')].map((e) => e.textContent ?? '').join('');
  return [...el.classList]
    .filter((c) => c.startsWith('css-'))
    .map((c) => css.match(new RegExp(String.raw`\.${c}\{([^}]*)\}`))?.[1] ?? '')
    .join(';');
};

const registroExitoso = () =>
  servidor.use(
    http.post('*/api/suministros/medicamentos', () =>
      HttpResponse.json({ data: suministro() }, { status: 201 }),
    ),
  );

/** Elige la prescripción, confirma con el rostro simulado y espera el resultado. */
async function confirmarConRostro() {
  await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
  await userEvent.click(
    await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
  );
}

describe('estado de cada toma a simple vista (F22)', () => {
  it('una toma ya dada se marca como aviso (contorno, color de advertencia e ícono), no con el verde de "todo bien"', async () => {
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
    await screen.findByRole('button', { name: /Paracetamol/ });

    const dada = chipDe(/Clonazepam/, /Ya se dio/);
    expect(dada).toHaveClass('MuiChip-colorWarning');
    expect(dada).toHaveClass('MuiChip-outlined');
    expect(dada).not.toHaveClass('MuiChip-colorSuccess');
    expect(dada).not.toHaveClass('MuiChip-filled');
    expect(within(dada).getByTestId('HistoryOutlinedIcon')).toBeInTheDocument();

    // Lo que toca o está atrasado sigue relleno; lo que falta, con contorno neutro.
    const ahora = chipDe(/Paracetamol/, 'Toca ahora');
    expect(ahora).toHaveClass('MuiChip-colorPrimary');
    expect(ahora).toHaveClass('MuiChip-filled');
    const atrasada = chipDe(/Enalapril/, /Atrasada/);
    expect(atrasada).toHaveClass('MuiChip-colorWarning');
    expect(atrasada).toHaveClass('MuiChip-filled');
    const falta = chipDe(/Omeprazol/, /Faltan/);
    expect(falta).toHaveClass('MuiChip-colorDefault');
    expect(falta).toHaveClass('MuiChip-outlined');
  });

  it('el chip de la tarjeta y el aviso al elegirla dicen la misma hora', async () => {
    const hace10 = enMinutos(-10);
    conPrescripciones({
      ...vigente,
      proximaToma: enMinutos(470),
      ultimasAdministraciones: [
        { id: 1, fechaHora: hace10, cantidad: 500, usuario: 'Acosta, Sofía' },
      ],
    });
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));

    const hora = formatearHora(hace10);
    expect(chipDe(/Paracetamol/, /Ya se dio/)).toHaveTextContent(`Ya se dio a las ${hora}`);
    expect(screen.getByRole('alert')).toHaveTextContent(`ya se dio a las ${hora} (Acosta, Sofía)`);
  });
});

describe('las tarjetas se ven tocables y la elegida se distingue (F24)', () => {
  it('en reposo cada tarjeta muestra un círculo vacío, que pasa a tilde al elegirla', async () => {
    conPrescripciones(vigente, otraVigente(41, 'Enalapril', 10));
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);
    const paracetamol = await screen.findByRole('button', { name: /Paracetamol/ });
    const enalapril = screen.getByRole('button', { name: /Enalapril/ });

    for (const tarjeta of [paracetamol, enalapril]) {
      expect(tarjeta).toHaveAttribute('aria-pressed', 'false');
      expect(within(tarjeta).getByTestId('RadioButtonUncheckedIcon')).toHaveStyle({
        fontSize: '36px',
      });
      expect(within(tarjeta).queryByTestId('CheckCircleIcon')).not.toBeInTheDocument();
    }

    await userEvent.click(paracetamol);

    expect(paracetamol).toHaveAttribute('aria-pressed', 'true');
    expect(within(paracetamol).getByTestId('CheckCircleIcon')).toHaveStyle({ fontSize: '36px' });
    expect(within(paracetamol).queryByTestId('RadioButtonUncheckedIcon')).not.toBeInTheDocument();
    expect(enalapril).toHaveAttribute('aria-pressed', 'false');
    expect(within(enalapril).getByTestId('RadioButtonUncheckedIcon')).toBeInTheDocument();
  });

  it('la elegida lleva borde y tinte del color primario, no el gris de "deshabilitada"', async () => {
    conPrescripciones(vigente, otraVigente(41, 'Enalapril', 10));
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol/ }));

    const elegida = cssDe(tarjetaDe(/Paracetamol/));
    expect(elegida).toContain('border-color:var(--mui-palette-primary-main)');
    expect(elegida).toMatch(
      /background-color:rgba\(var\(--mui-palette-primary-mainChannel\)\s*\/\s*0\.08\)/,
    );
    expect(elegida).not.toContain('action-selected');
    const reposo = cssDe(tarjetaDe(/Enalapril/));
    expect(reposo).toContain('border-color:var(--mui-palette-divider)');
    expect(reposo).not.toContain('primary-mainChannel');
    expect(reposo).not.toContain('action-selected');
  });

  it('indica qué hacer sobre las tarjetas: "Toque el medicamento que va a dar"', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    const instruccion = await screen.findByText('Toque el medicamento que va a dar');
    const tarjeta = screen.getByRole('button', { name: /Paracetamol/ });
    expect(instruccion.compareDocumentPosition(tarjeta)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('sin prescripciones vigentes no hay nada que tocar y no da la instrucción', async () => {
    conPrescripciones();
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    expect(await screen.findByText(/no tiene prescripciones vigentes/)).toBeInTheDocument();
    expect(screen.queryByText('Toque el medicamento que va a dar')).not.toBeInTheDocument();
  });

  it('el botón deshabilitado dice por qué cuando todavía no se eligió el medicamento', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    const confirmar = await screen.findByRole('button', { name: 'Confirmar con mi rostro' });
    expect(confirmar).toBeDisabled();
    expect(screen.getByText('Elija el medicamento que va a dar')).toBeVisible();
    expect(confirmar).toHaveAccessibleDescription('Elija el medicamento que va a dar');

    await userEvent.click(screen.getByRole('button', { name: /Paracetamol 500\smg/ }));

    expect(screen.queryByText('Elija el medicamento que va a dar')).not.toBeInTheDocument();
    const habilitado = screen.getByRole('button', { name: 'Confirmar con mi rostro' });
    expect(habilitado).toBeEnabled();
    expect(habilitado).not.toHaveAccessibleDescription();
  });

  it('con la toma ya dada, el botón deshabilitado pide marcar que corresponde otra toma', async () => {
    conPrescripciones({
      ...vigente,
      proximaToma: enMinutos(470),
      ultimasAdministraciones: [
        { id: 1, fechaHora: enMinutos(-10), cantidad: 500, usuario: 'Acosta, Sofía' },
      ],
    });
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));

    const ayuda = 'Marque «Corresponde dar otra toma» para continuar';
    const confirmar = screen.getByRole('button', { name: 'Confirmar con mi rostro' });
    expect(confirmar).toBeDisabled();
    expect(screen.getByText(ayuda)).toBeVisible();
    expect(confirmar).toHaveAccessibleDescription(ayuda);
    // Ya se sabe qué medicamento: la otra ayuda no corresponde.
    expect(screen.queryByText('Elija el medicamento que va a dar')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Corresponde dar otra toma/ }));

    expect(confirmar).toBeEnabled();
    expect(screen.queryByText(ayuda)).not.toBeInTheDocument();
    expect(confirmar).not.toHaveAccessibleDescription();
  });
});

describe('una sola columna con el mismo ancho (F35)', () => {
  /** El ancestro más cercano que limita el ancho (max-width), o null si ninguno lo hace. */
  const columnaDe = (el: HTMLElement) => {
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      if (getComputedStyle(n).maxWidth.endsWith('px')) return n;
    }
    return null;
  };

  it('selector, identidad del paciente, tarjetas y formulario comparten el mismo ancho máximo', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));

    const piezas = [
      screen.getByRole('combobox', { name: 'Paciente' }),
      screen.getByRole('region', { name: 'Paciente' }),
      screen.getByRole('button', { name: /Paracetamol/ }),
      screen.getByRole('region', { name: 'Revise antes de confirmar' }),
      screen.getByRole('button', { name: 'Confirmar con mi rostro' }),
    ];
    const columna = columnaDe(piezas[0]!);
    expect(columna).not.toBeNull();
    expect(getComputedStyle(columna!).maxWidth).toBe('760px');
    for (const pieza of piezas) expect(columnaDe(pieza)).toBe(columna);
  });
});

describe('el resultado de confirmar se ve y se anuncia (UX-01)', () => {
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    scrollIntoView.mockClear();
    // jsdom no implementa scrollIntoView.
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  const falla = (estado: number, codigo: string, mensaje: string) =>
    servidor.use(
      http.post('*/api/suministros/medicamentos', () =>
        HttpResponse.json({ error: { codigo, mensaje } }, { status: estado }),
      ),
    );

  it('al registrar bien, el aviso de éxito se lleva a la vista y recibe el foco', async () => {
    validarRostro();
    registroExitoso();
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await confirmarConRostro();

    const exito = await screen.findByRole('status');
    const contenedor = exito.closest('[tabindex="-1"]');
    expect(contenedor).not.toBeNull();
    expect(contenedor).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(scrollIntoView.mock.contexts).toContain(contenedor);
  });

  it('un error del servidor se lleva a la vista y recibe el foco, con el botón todavía a mano', async () => {
    validarRostro();
    falla(422, 'SIN_PRESCRIPCION_VIGENTE', 'La prescripción está suspendida');
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await confirmarConRostro();

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('La prescripción está suspendida');
    const contenedor = error.closest('[tabindex="-1"]');
    expect(contenedor).not.toBeNull();
    expect(contenedor).toHaveFocus();
    expect(scrollIntoView.mock.contexts).toContain(contenedor);
  });

  it.each([
    [500, 'ERROR_INTERNO', 'Error inesperado del servidor'],
    [502, 'ERROR_INTERNO', 'Bad gateway'],
    [504, 'ERROR_INTERNO', 'Tiempo de espera agotado'],
  ])(
    'con un %i no se sabe si quedó registrada: pudo guardarse antes de fallar',
    async (estado, codigo, mensaje) => {
      validarRostro();
      falla(estado, codigo, mensaje);
      renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

      await confirmarConRostro();

      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent('No se sabe si quedó registrada');
      expect(alerta).toHaveTextContent('Benítez, Rosa (cama A-01)');
      expect(alerta).toHaveTextContent(/revise el historial/);
      expect(within(alerta).getByRole('button', { name: 'Ver el historial' })).toBeInTheDocument();
      expect(alerta.closest('[tabindex="-1"]')).toHaveFocus();
    },
  );

  it('con un rechazo del servidor (4xx) no habla de "no se sabe": se sabe que no se registró', async () => {
    validarRostro();
    falla(409, 'CONFLICTO', 'La prescripción cambió mientras la elegía');
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await confirmarConRostro();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('La prescripción cambió mientras la elegía');
    expect(alerta).not.toHaveTextContent(/no se sabe/i);
    expect(within(alerta).queryByRole('button', { name: 'Ver el historial' })).toBeNull();
  });
});

describe('al cambiar de paciente no queda el intento anterior (UX-05)', () => {
  const otro = paciente({
    id: 8,
    apellido: 'Suárez',
    nombre: 'Ana',
    dni: '28999888',
    cama: {
      id: 2,
      numero: 'A-02',
      sala: { id: 1, nombre: 'Sala A – Neurorrehabilitación' },
      desde: '2026-10-01T13:00:00.000Z',
    },
  });
  const prepararOtro = () =>
    servidor.use(
      http.get('*/api/pacientes', () => listaDePacientes([paciente(), otro])),
      http.get('*/api/pacientes/8', () => HttpResponse.json({ data: otro })),
      http.get('*/api/pacientes/8/prescripciones', () =>
        HttpResponse.json({ data: [otraVigente(50, 'Ibuprofeno', 400, { pacienteId: 8 })] }),
      ),
    );
  const elegirOtro = () =>
    userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Paciente' }),
      screen.getByRole('option', { name: /Suárez, Ana/ }),
    );

  it('el aviso de "no se sabe si quedó registrada" del paciente anterior desaparece', async () => {
    validarRostro();
    prepararOtro();
    servidor.use(http.post('*/api/suministros/medicamentos', () => HttpResponse.error()));
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);
    await confirmarConRostro();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se sabe si quedó registrada');

    await elegirOtro();

    expect(await screen.findByRole('button', { name: /Ibuprofeno/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/No se sabe si quedó registrada/)).not.toBeInTheDocument();
  });

  it('el aviso de éxito del paciente anterior también desaparece', async () => {
    validarRostro();
    registroExitoso();
    prepararOtro();
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);
    await confirmarConRostro();
    expect(await screen.findByRole('status')).toHaveTextContent(/Se registró Paracetamol/);

    await elegirOtro();

    expect(await screen.findByRole('button', { name: /Ibuprofeno/ })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('si venía del panel de recordatorios, cambiar de paciente no pierde el camino de vuelta', async () => {
    prepararOtro();
    renderizarApp(
      '/suministros/medicamento?pacienteId=7&prescripcionId=40&desde=recordatorios',
      ENFERMERO,
    );
    expect(await screen.findByRole('button', { name: /Paracetamol/ })).toBeInTheDocument();

    await elegirOtro();

    expect(await screen.findByRole('button', { name: /Ibuprofeno/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/recordatorios');
  });

  it('si el registro falla después de cambiar de paciente, el aviso nombra al del intento y el historial es el suyo', async () => {
    validarRostro();
    prepararOtro();
    servidor.use(
      http.get('*/api/pacientes/7/historial', () => HttpResponse.json({ data: HISTORIAL })),
    );
    let soltar!: () => void;
    const respuesta = new Promise<void>((resolver) => (soltar = resolver));
    servidor.use(
      http.post('*/api/suministros/medicamentos', async () => {
        await respuesta;
        return HttpResponse.error();
      }),
    );
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);
    await confirmarConRostro();

    // Mientras el servidor no responde, se pasa a otro paciente.
    await elegirOtro();
    expect(await screen.findByRole('button', { name: /Ibuprofeno/ })).toBeInTheDocument();
    soltar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Benítez, Rosa (cama A-01)');
    expect(alerta).not.toHaveTextContent('Suárez');
    await userEvent.click(within(alerta).getByRole('button', { name: 'Ver el historial' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /Benítez, Rosa/ }),
    ).toBeInTheDocument();
  });
});

describe('botonera y campos numéricos de la administración (F31 · UX-19)', () => {
  const grupo = () => screen.getByRole('group', { name: 'Acciones del formulario' });

  it('antes de elegir el medicamento, el botón deshabilitado y su ayuda van juntos en la botonera', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    const confirmar = await screen.findByRole('button', { name: 'Confirmar con mi rostro' });
    expect(within(grupo()).getAllByRole('button').at(-1)).toBe(confirmar);
    expect(within(grupo()).getByText('Elija el medicamento que va a dar')).toBeVisible();
    expect(confirmar).toHaveAccessibleDescription('Elija el medicamento que va a dar');
  });

  it('con el medicamento elegido, Confirmar con mi rostro es lo último de la botonera', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));

    const botones = within(grupo()).getAllByRole('button');
    expect(botones.map((b) => b.textContent)).toEqual(['Confirmar con mi rostro']);
    expect(botones.at(-1)).toBeEnabled();
    // Hay una sola botonera: la del formulario.
    expect(screen.getAllByRole('group', { name: 'Acciones del formulario' })).toHaveLength(1);
  });

  it('la rueda del mouse no cambia la cantidad: el campo suelta el foco', async () => {
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    const cantidad = screen.getByLabelText(/^Cantidad/);
    cantidad.focus();
    expect(cantidad).toHaveFocus();

    fireEvent.wheel(cantidad, { deltaY: 100 });

    expect(cantidad).not.toHaveFocus();
    expect(cantidad).toHaveValue(500);
  });
});

describe('volver al panel de recordatorios (desde=recordatorios)', () => {
  const DESDE_RECORDATORIOS =
    '/suministros/medicamento?pacienteId=7&prescripcionId=40&desde=recordatorios';
  const flecha = () => screen.getByRole('link', { name: 'Volver' });

  it('la flecha Volver lleva a Recordatorios y su ayuda lo dice', async () => {
    renderizarApp(DESDE_RECORDATORIOS, ENFERMERO);

    await screen.findByRole('button', { name: /Paracetamol 500\smg/ });
    expect(flecha()).toHaveAttribute('href', '/recordatorios');
    expect(flecha()).toHaveAccessibleDescription('Volver a Recordatorios');
  });

  it('sin venir del panel, la flecha sigue llevando a la ficha y el aviso no ofrece volver al panel', async () => {
    validarRostro();
    registroExitoso();
    renderizarApp('/suministros/medicamento?pacienteId=7', ENFERMERO);
    await screen.findByRole('button', { name: /Paracetamol 500\smg/ });
    expect(flecha()).toHaveAttribute('href', '/pacientes/7?pestana=prescripciones');

    await confirmarConRostro();

    const exito = await screen.findByRole('status');
    expect(within(exito).getByRole('button', { name: 'Ir a la ficha' })).toBeInTheDocument();
    expect(within(exito).queryByRole('button', { name: 'Volver a Recordatorios' })).toBeNull();
  });

  it('después de registrar, el aviso ofrece Volver a Recordatorios como acción principal (Ir a la ficha sigue)', async () => {
    validarRostro();
    registroExitoso();
    simularRecordatorios([]);
    renderizarApp(DESDE_RECORDATORIOS, ENFERMERO);

    await confirmarConRostro();

    const exito = await screen.findByRole('status');
    expect(exito).toHaveTextContent(/Se registró Paracetamol 500 mg a Benítez, Rosa/);
    const botones = within(exito).getAllByRole('button');
    const volver = within(exito).getByRole('button', { name: 'Volver a Recordatorios' });
    expect(within(exito).getByRole('button', { name: 'Ir a la ficha' })).toBeInTheDocument();
    // La principal es la única llena y va al final (DESIGN.md).
    expect(volver).toHaveClass('MuiButton-contained');
    expect(botones.filter((b) => b.textContent !== '').at(-1)).toBe(volver);

    // No hay nada sin guardar: vuelve sin preguntar.
    await userEvent.click(volver);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Recordatorios' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '¿Descartar lo cargado?' })).toBeNull();
  });

  it('al registrar vuelve a pedir los recordatorios: la toma quedó atendida en el servidor', async () => {
    validarRostro();
    registroExitoso();
    const pedidos = { total: 0 };
    servidor.use(
      http.get('*/api/recordatorios', () => {
        pedidos.total++;
        return HttpResponse.json({
          data: [],
          meta: { total: 0, urgentes: 0, ahora: new Date().toISOString() },
        });
      }),
    );
    renderizarApp(DESDE_RECORDATORIOS, ENFERMERO);
    // La insignia de la barra ya pidió la lista.
    await waitFor(() => expect(pedidos.total).toBeGreaterThan(0));
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
    const antes = pedidos.total;
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(/Se registró Paracetamol/);
    await waitFor(() => expect(pedidos.total).toBeGreaterThan(antes));
  });

  it('con algo cargado sin registrar, la flecha pregunta antes de volver al panel', async () => {
    simularRecordatorios([]);
    renderizarApp(DESDE_RECORDATORIOS, ENFERMERO);
    // La prescripción del recordatorio quedó elegida: se escribe una nota.
    await waitFor(() => expect(screen.getByLabelText(/^Cantidad/)).toHaveValue(500));
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Con jugo');

    await userEvent.click(flecha());

    const dialogo = await screen.findByRole('dialog', { name: '¿Descartar lo cargado?' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Descartar' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Recordatorios' }),
    ).toBeInTheDocument();
  });
});
