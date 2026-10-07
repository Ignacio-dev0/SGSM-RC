import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO } from '../../pruebas/datos';
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
