import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import { errorApi, estudio, prepararEstudios, validarRostro } from '../../pruebas/datosEstudios';
import {
  AHORA_SERVIDOR,
  RECORDATORIOS,
  aLos,
  fijarHoraTablet,
  recordatorio,
  recordatorioDeEstudio,
  registrarConexiones,
  respuestaRecordatorios,
  simularRecordatorios,
} from '../../pruebas/datosRecordatorios';
import { prepararSuministros } from '../../pruebas/datosSuministros';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(() => fijarHoraTablet());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const lista = (nombre = 'Recordatorios para atender') =>
  screen.findByRole('list', { name: nombre });
const tarjetas = async () => within(await lista()).findAllByRole('listitem');

/** Cuenta los pedidos de la lista y contesta con lo que devuelva `responder`. */
function contarPedidos(responder: () => Response = () => respuestaRecordatorios(RECORDATORIOS)) {
  const pedidos: URLSearchParams[] = [];
  servidor.use(
    http.get('*/api/recordatorios', ({ request }) => {
      pedidos.push(new URL(request.url).searchParams);
      return responder();
    }),
  );
  return pedidos;
}

describe('recordatorios para atender (T506 · CU24)', () => {
  it('muestra cada toma por urgencia: chip, hora grande, cuánto falta, paciente con cama y qué se da', async () => {
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);

    expect(await screen.findByRole('heading', { name: 'Recordatorios', level: 1 })).toBeVisible();
    expect(document.title).toBe('Recordatorios · SGSM-RC');
    const [vencida, urgente, pronto, programada] = await tarjetas();

    expect(vencida).toHaveTextContent('Vencida');
    expect(vencida).toHaveTextContent('11:15');
    expect(vencida).toHaveTextContent(/Atrasada 45\smin/);
    expect(vencida).toHaveTextContent('Gómez, Juan');
    expect(vencida).toHaveTextContent('DNI 28999111');
    expect(vencida).toHaveTextContent(/Cama B.03 · Sala B – Traumatología/);
    expect(vencida).toHaveTextContent(/Enalapril 10\smg/);
    expect(vencida).toHaveTextContent('Oral');

    expect(urgente).toHaveTextContent('Urgente');
    expect(urgente).toHaveTextContent('11:52');
    expect(urgente).toHaveTextContent(/Atrasada 8\smin/);
    expect(urgente).toHaveTextContent('Benítez, Rosa');
    expect(urgente).toHaveTextContent(/Paracetamol 500\smg/);

    expect(pronto).toHaveTextContent('Pronto');
    expect(pronto).toHaveTextContent('12:12');
    expect(pronto).toHaveTextContent(/Faltan 12\smin/);
    expect(pronto).toHaveTextContent(/Ceftriaxona 1000\smg/);
    expect(pronto).toHaveTextContent('Intravenosa');

    expect(programada).toHaveTextContent('Programada');
    expect(programada).toHaveTextContent(/Faltan 25\smin/);

    expect(screen.getByText(/4 para atender · 2 urgentes/)).toBeInTheDocument();
  });

  it('cada tarjeta se nombra por la toma y el paciente', async () => {
    simularRecordatorios([recordatorio()]);
    renderizarApp('/recordatorios', ENFERMERO);

    expect(
      await screen.findByRole('listitem', { name: 'Toma de las 11:52 · Benítez, Rosa' }),
    ).toBeInTheDocument();
  });

  it('el chip dice la urgencia con texto e ícono; lo urgente y lo vencido van rellenos de advertencia, nunca verde', async () => {
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);
    const [vencida, urgente, pronto, programada] = await tarjetas();

    const chip = (tarjeta: HTMLElement, texto: string) =>
      within(tarjeta).getByText(texto).closest('.MuiChip-root') as HTMLElement;
    for (const [tarjeta, texto] of [
      [vencida!, 'Vencida'],
      [urgente!, 'Urgente'],
    ] as const) {
      expect(chip(tarjeta, texto)).toHaveClass('MuiChip-filled', 'MuiChip-colorWarning');
      expect(chip(tarjeta, texto).querySelector('svg')).not.toBeNull();
    }
    expect(chip(pronto!, 'Pronto')).toHaveClass('MuiChip-outlined');
    expect(chip(programada!, 'Programada')).toHaveClass('MuiChip-outlined');
    expect((await lista()).querySelector('[class*="Success"], [class*="colorError"]')).toBeNull();
  });

  it('"Faltan" y "Atrasada" se actualizan solos cada 30 s', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(AHORA_SERVIDOR));
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);
    const pronto = (await tarjetas())[2]!;
    expect(pronto).toHaveTextContent(/Faltan 12\smin/);

    act(() => vi.advanceTimersByTime(60_000));

    await waitFor(() => expect(pronto).toHaveTextContent(/Faltan 11\smin/));
  });

  it('con el reloj de la tablet atrasado, calcula con la hora del servidor (R6)', async () => {
    fijarHoraTablet(new Date(Date.parse(AHORA_SERVIDOR) - 10 * 60_000).toISOString());
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);

    const pronto = (await tarjetas())[2]!;
    await waitFor(() => expect(pronto).toHaveTextContent(/Faltan 12\smin/));
  });

  it('un paciente sin cama asignada lo dice', async () => {
    simularRecordatorios([recordatorio({ cama: null })]);
    renderizarApp('/recordatorios', ENFERMERO);

    expect((await tarjetas())[0]).toHaveTextContent('Sin cama asignada');
  });
});

describe('recordatorios de estudio (T504 · T513)', () => {
  const confirmarEstudio = () =>
    screen.findByRole('button', {
      name: 'Confirmar que se realizó Rx de tórax frente y perfil a Benítez, Rosa',
    });

  /** Confirma con el rostro simulado desde el diálogo que abrió la tarjeta. */
  async function confirmarConRostro() {
    await userEvent.click(await confirmarEstudio());
    const dialogo = await screen.findByRole('dialog', {
      name: 'Confirmar que se realizó el estudio',
    });
    await userEvent.click(
      await within(dialogo).findByRole('button', { name: 'Confirmar con mi rostro' }),
    );
    return dialogo;
  }

  it('se muestran como las tomas: hora grande, cuánto falta, paciente con cama y qué estudio', async () => {
    simularRecordatorios([
      recordatorio(),
      recordatorioDeEstudio(),
      recordatorioDeEstudio({
        id: 21,
        fechaHoraObjetivo: aLos(20),
        estudio: { id: 61, nombre: 'Laboratorio', tipoEstudio: 'Laboratorio', preparacion: null },
      }),
    ]);
    renderizarApp('/recordatorios', ENFERMERO);
    const [toma, rx, laboratorio] = await tarjetas();

    expect(rx).toHaveAccessibleName('Estudio de las 12:05 · Benítez, Rosa');
    expect(rx).toHaveTextContent('Pronto');
    expect(rx).toHaveTextContent('12:05');
    expect(rx).toHaveTextContent(/Faltan 5\smin/);
    expect(rx).toHaveTextContent('Benítez, Rosa');
    expect(rx).toHaveTextContent('DNI 30111222');
    expect(rx).toHaveTextContent(/Cama A.01 · Sala A – Neurorrehabilitación/);
    expect(rx).toHaveTextContent('Rx de tórax frente y perfil');
    expect(rx).toHaveTextContent('Radiografía');
    expect(rx).toHaveTextContent('Preparación: Retirar alhajas y objetos metálicos');
    // Otro ícono que el del medicamento: se distingue de un vistazo.
    expect(within(rx!).getByTestId('BiotechOutlinedIcon')).toBeInTheDocument();
    expect(within(rx!).queryByTestId('MedicationOutlinedIcon')).not.toBeInTheDocument();
    expect(within(toma!).getAllByTestId('MedicationOutlinedIcon').length).toBeGreaterThan(0);

    // Sin preparación no la menciona, y el tipo no se repite si es el mismo nombre.
    expect(laboratorio).not.toHaveTextContent('Preparación');
    expect(within(laboratorio!).getAllByText('Laboratorio')).toHaveLength(1);
  });

  it('un estudio vencido lo dice en masculino ("Vencido", "Atrasado")', async () => {
    simularRecordatorios([
      recordatorioDeEstudio({
        estado: 'VENCIDO',
        fechaHoraObjetivo: aLos(-45),
        vencidoEn: aLos(-15),
      }),
    ]);
    renderizarApp('/recordatorios', ENFERMERO);
    const [rx] = await tarjetas();

    expect(rx).toHaveTextContent('Vencido');
    expect(rx).toHaveTextContent(/Atrasado 45\smin/);
    expect(rx).not.toHaveTextContent('Vencida');
  });

  it('no ofrece "No se administró" ni "Administrar": se atiende confirmando el estudio', async () => {
    simularRecordatorios([recordatorioDeEstudio()]);
    renderizarApp('/recordatorios', ENFERMERO);
    const [rx] = await tarjetas();

    const confirmar = await confirmarEstudio();
    // Con contorno, como Administrar: en un listado ninguna fila lleva la acción llena.
    expect(confirmar).toHaveClass('MuiButton-outlined');
    expect(within(rx!).getAllByRole('button')).toEqual([confirmar]);
  });

  it('quien confirma estudios lo hace con el rostro desde la tarjeta; el aviso toma el foco y la lista se vuelve a pedir', async () => {
    prepararEstudios();
    validarRostro();
    let confirmado = false;
    let enviado: unknown;
    servidor.use(
      http.post('*/api/estudios/60/confirmar', async ({ request }) => {
        enviado = await request.json();
        confirmado = true;
        return HttpResponse.json({
          data: estudio({
            estado: 'REALIZADO',
            realizadoEn: AHORA_SERVIDOR,
            confirmadoPor: { id: 3, nombre: 'Acosta, Sofía' },
          }),
        });
      }),
    );
    simularRecordatorios();
    const pedidos = contarPedidos(() =>
      respuestaRecordatorios(
        confirmado ? [recordatorio()] : [recordatorio(), recordatorioDeEstudio()],
      ),
    );
    renderizarApp('/recordatorios', ENFERMERO);

    const dialogo = await confirmarConRostro();
    // Qué se confirma y a quién, con los datos del recordatorio.
    expect(dialogo).toHaveTextContent('Rx de tórax frente y perfil');
    expect(dialogo).toHaveTextContent('Benítez, Rosa · DNI 30111222');
    expect(dialogo).toHaveTextContent(/Cama A.01/);
    const antes = pedidos.length;
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    const aviso = (
      await screen.findByText(/Se confirmó que se realizó Rx de tórax frente y perfil/)
    ).closest('.MuiAlert-root');
    expect(enviado).toEqual({ validacionToken: 'tok-ok' });
    // El hook renueva ['recordatorios']: el estudio confirmado sale de la lista.
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antes));
    await waitFor(async () => expect(await tarjetas()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(aviso).toHaveFocus();
  });

  it('si otra persona ya lo confirmó o canceló (409), lo avisa', async () => {
    prepararEstudios();
    validarRostro();
    servidor.use(
      http.post('*/api/estudios/60/confirmar', () =>
        errorApi(409, 'ESTUDIO_NO_PROGRAMADO', 'El estudio ya no está programado'),
      ),
    );
    simularRecordatorios([recordatorioDeEstudio()]);
    renderizarApp('/recordatorios', ENFERMERO);

    await confirmarConRostro();
    await userEvent.click(
      await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este estudio ya fue confirmado o cancelado por otra persona',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('atender un recordatorio (T507)', () => {
  it('Administrar abre la administración con el paciente y la prescripción ya elegidos', async () => {
    prepararSuministros();
    simularRecordatorios([recordatorio()]);
    const { router } = renderizarApp('/recordatorios', ENFERMERO);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Administrar Paracetamol a Benítez, Rosa' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Administrar medicamento' }),
    ).toBeInTheDocument();
    // Dice de dónde viene, para que la administración ofrezca volver al panel.
    const destino = new URLSearchParams(router.state.location.search);
    expect(Object.fromEntries(destino)).toEqual({
      pacienteId: '7',
      prescripcionId: '40',
      desde: 'recordatorios',
    });
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAccessibleDescription(
      'Volver a Recordatorios',
    );
    expect(await screen.findByRole('region', { name: 'Paciente' })).toHaveTextContent(
      'Benítez, Rosa',
    );
    // La prescripción de la toma quedó elegida: la cantidad ya tiene su dosis.
    await waitFor(() => expect(screen.getByLabelText(/^Cantidad/)).toHaveValue(500));
  });

  it('desde la administración se vuelve al panel con los mismos filtros (por ejemplo, la sala)', async () => {
    prepararSuministros();
    simularRecordatorios([recordatorio()]);
    renderizarApp('/recordatorios?tipo=MEDICAMENTO&salaId=1', ENFERMERO);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Administrar Paracetamol a Benítez, Rosa' }),
    );
    await screen.findByRole('heading', { name: 'Administrar medicamento' });
    const volver = screen.getByRole('link', { name: 'Volver' });
    expect(volver).toHaveAttribute('href', '/recordatorios?tipo=MEDICAMENTO&salaId=1');

    await userEvent.click(volver);
    await waitFor(() => expect(screen.getByLabelText('Sala')).toHaveValue('1'));
    expect(screen.getByLabelText('Tipo')).toHaveValue('MEDICAMENTO');
  });

  it('"No se administró" pide el motivo, lo registra y vuelve a pedir la lista', async () => {
    const enviados: { id: string; cuerpo: unknown }[] = [];
    simularRecordatorios();
    const pedidos = contarPedidos();
    servidor.use(
      http.post('*/api/recordatorios/:id/no-administrar', async ({ request, params }) => {
        enviados.push({ id: String(params.id), cuerpo: await request.json() });
        return HttpResponse.json({
          data: { ...recordatorio(), estado: 'ATENDIDO', motivoNoAdministrado: 'En ayunas' },
        });
      }),
    );
    renderizarApp('/recordatorios', ENFERMERO);
    const urgente = (await tarjetas())[1]!;

    await userEvent.click(within(urgente).getByRole('button', { name: /^No se administró/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'No se administró' });
    expect(dialogo).toHaveTextContent(/Paracetamol 500\smg/);
    expect(dialogo).toHaveTextContent('11:52');
    expect(dialogo).toHaveTextContent('Benítez, Rosa');
    expect(dialogo).toHaveTextContent('DNI 30111222');
    expect(dialogo).toHaveTextContent(/cama A.01/);
    expect(dialogo).toHaveTextContent(/no se puede deshacer/);
    const registrar = within(dialogo).getByRole('button', { name: 'Registrar' });
    expect(registrar).toBeDisabled();

    await userEvent.type(
      within(dialogo).getByRole('textbox', { name: /Por qué no se administró/ }),
      'Paciente en ayunas para un estudio',
    );
    const antes = pedidos.length;
    await userEvent.click(registrar);

    expect(await screen.findByText(/Se registró que no se administró Paracetamol/)).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(enviados).toEqual([
      { id: '12', cuerpo: { motivo: 'Paciente en ayunas para un estudio' } },
    ]);
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antes));
  });

  it('si otra persona ya lo atendió (409), lo avisa y vuelve a pedir la lista', async () => {
    let atendido = false;
    simularRecordatorios();
    const pedidos = contarPedidos(() =>
      respuestaRecordatorios(atendido ? RECORDATORIOS.filter((r) => r.id !== 12) : RECORDATORIOS),
    );
    servidor.use(
      http.post('*/api/recordatorios/:id/no-administrar', () => {
        atendido = true;
        return HttpResponse.json(
          {
            error: {
              codigo: 'RECORDATORIO_NO_PENDIENTE',
              mensaje: 'El recordatorio ya fue atendido',
              detalles: { estado: 'ATENDIDO' },
            },
          },
          { status: 409 },
        );
      }),
    );
    renderizarApp('/recordatorios', ENFERMERO);
    const urgente = (await tarjetas())[1]!;
    await userEvent.click(within(urgente).getByRole('button', { name: /^No se administró/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'No se administró' });
    await userEvent.type(within(dialogo).getByRole('textbox'), 'Rechazó la medicación');
    const antes = pedidos.length;
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese recordatorio ya fue atendido por otra persona',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antes));
    await waitFor(async () => expect(await tarjetas()).toHaveLength(3));
  });

  it('al salir la tarjeta de la lista, el foco queda en el aviso del resultado (no se pierde)', async () => {
    let atendido = false;
    simularRecordatorios();
    contarPedidos(() =>
      respuestaRecordatorios(atendido ? RECORDATORIOS.filter((r) => r.id !== 12) : RECORDATORIOS),
    );
    servidor.use(
      http.post('*/api/recordatorios/:id/no-administrar', () => {
        atendido = true;
        return HttpResponse.json({
          data: { ...recordatorio(), estado: 'ATENDIDO', motivoNoAdministrado: 'En ayunas' },
        });
      }),
    );
    renderizarApp('/recordatorios', ENFERMERO);
    const urgente = (await tarjetas())[1]!;
    await userEvent.click(within(urgente).getByRole('button', { name: /^No se administró/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'No se administró' });
    await userEvent.type(within(dialogo).getByRole('textbox'), 'En ayunas para un estudio');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    // La tarjeta (con el botón que abrió el diálogo) ya no está.
    await waitFor(async () => expect(await tarjetas()).toHaveLength(3));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const aviso = screen
      .getByText(/Se registró que no se administró Paracetamol/)
      .closest('.MuiAlert-root');
    expect(aviso).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('un recordatorio de estudio (422) no se atiende con "No se administró": lo explica', async () => {
    simularRecordatorios([recordatorio()]);
    servidor.use(
      http.post('*/api/recordatorios/:id/no-administrar', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'NO_ES_TOMA',
              mensaje: 'Los recordatorios de estudios se atienden confirmando el estudio',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderizarApp('/recordatorios', ENFERMERO);
    await userEvent.click(await screen.findByRole('button', { name: /^No se administró/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'No se administró' });
    await userEvent.type(within(dialogo).getByRole('textbox'), 'No corresponde');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Es el recordatorio de un estudio: se atiende confirmando el estudio/,
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('si falla por otra causa, lo dice dentro del diálogo y deja reintentar sin perder el motivo', async () => {
    simularRecordatorios([recordatorio()]);
    servidor.use(http.post('*/api/recordatorios/:id/no-administrar', () => HttpResponse.error()));
    renderizarApp('/recordatorios', ENFERMERO);
    await userEvent.click(await screen.findByRole('button', { name: /^No se administró/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'No se administró' });
    await userEvent.type(within(dialogo).getByRole('textbox'), 'Vomitó');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Registrar' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/No hay conexión/);
    expect(within(dialogo).getByRole('textbox')).toHaveValue('Vomitó');
  });

  it('quien solo ve los recordatorios (médico) no tiene acciones ni el interruptor de sonido', async () => {
    simularRecordatorios([...RECORDATORIOS, recordatorioDeEstudio()]);
    renderizarApp('/recordatorios', MEDICO);

    expect(await tarjetas()).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /^Administrar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^No se administró/ })).not.toBeInTheDocument();
    // Programa estudios, pero no los confirma (estudios.confirmar es de enfermería).
    expect(
      screen.queryByRole('button', { name: /^Confirmar que se realizó/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Sonido de avisos' })).not.toBeInTheDocument();
  });
});

describe('estados de la lista', () => {
  it('sin nada para atender lo dice, con la hora de la última actualización', async () => {
    simularRecordatorios([]);
    renderizarApp('/recordatorios', ENFERMERO);

    expect(
      await screen.findByText('No hay tomas ni estudios para atender ahora.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Actualizada a las 12:00/).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('list', { name: 'Recordatorios para atender' }),
    ).not.toBeInTheDocument();
  });

  it('si no se puede cargar lo dice y deja reintentar, sin afirmar que no hay tomas', async () => {
    let fallar = true;
    simularRecordatorios();
    // Sin tiempo real (cierre normal): nada vuelve a pedir la lista por su cuenta.
    registrarConexiones((cliente) => cliente.close(1000));
    contarPedidos(() =>
      fallar
        ? HttpResponse.json(
            { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
            { status: 500 },
          )
        : respuestaRecordatorios(RECORDATORIOS),
    );
    renderizarApp('/recordatorios', ENFERMERO);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudieron cargar los recordatorios/);
    expect(screen.queryByText(/No hay tomas/)).not.toBeInTheDocument();

    fallar = false;
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));
    expect(await tarjetas()).toHaveLength(4);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mientras carga lo dice', async () => {
    // La lista no llega nunca: queda cargando.
    servidor.use(
      http.get('*/api/recordatorios', () => new Promise<Response>(() => {})),
      http.get('*/api/salas', () => HttpResponse.json({ data: [] })),
    );
    renderizarApp('/recordatorios', ENFERMERO);

    expect(await screen.findByText('Cargando recordatorios…')).toBeInTheDocument();
  });
});

describe('filtro por sala', () => {
  it('pide solo los de la sala elegida y el filtro queda en la dirección', async () => {
    simularRecordatorios();
    const pedidos = contarPedidos();
    renderizarApp('/recordatorios?salaId=2', ENFERMERO);

    const sala = await screen.findByLabelText('Sala');
    await waitFor(() => expect(sala).toHaveValue('2'));
    await waitFor(() => expect(pedidos.some((p) => p.get('salaId') === '2')).toBe(true));

    await userEvent.selectOptions(sala, 'Todas');
    await waitFor(() => expect(pedidos.at(-1)?.has('salaId')).toBe(false));
  });
});

describe('filtro por tipo', () => {
  it('pide solo los del tipo elegido y el filtro queda en la dirección', async () => {
    simularRecordatorios();
    const pedidos = contarPedidos();
    const { router } = renderizarApp('/recordatorios?tipo=ESTUDIO', ENFERMERO);

    const tipo = await screen.findByLabelText('Tipo');
    await waitFor(() => expect(tipo).toHaveValue('ESTUDIO'));
    await waitFor(() => expect(pedidos.some((p) => p.get('tipo') === 'ESTUDIO')).toBe(true));
    expect(
      within(tipo)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Todos', 'Tomas', 'Estudios']);

    await userEvent.selectOptions(tipo, 'Tomas');
    await waitFor(() => expect(pedidos.at(-1)?.get('tipo')).toBe('MEDICAMENTO'));
    expect(router.state.location.search).toBe('?tipo=MEDICAMENTO');

    await userEvent.selectOptions(tipo, 'Todos');
    await waitFor(() => expect(pedidos.at(-1)?.has('tipo')).toBe(false));
  });

  it('un tipo que no existe en la dirección se ignora (no se manda al servidor)', async () => {
    simularRecordatorios();
    const pedidos = contarPedidos();
    renderizarApp('/recordatorios?tipo=OTRO', ENFERMERO);

    expect(await tarjetas()).toHaveLength(4);
    expect(pedidos.every((p) => !p.has('tipo'))).toBe(true);
    expect(screen.getByLabelText('Tipo')).toHaveValue('');
  });

  it.each([
    ['MEDICAMENTO', 'Tomas para atender', 'No hay tomas para atender ahora'],
    ['ESTUDIO', 'Estudios para atender', 'No hay estudios para atender ahora'],
  ])('con tipo=%s la lista y el vacío hablan de lo filtrado', async (tipo, nombre, vacio) => {
    simularRecordatorios([tipo === 'ESTUDIO' ? recordatorioDeEstudio() : recordatorio()]);
    const { unmount } = renderizarApp(`/recordatorios?tipo=${tipo}`, ENFERMERO);
    expect(await lista(nombre)).toBeInTheDocument();
    unmount();

    simularRecordatorios([]);
    renderizarApp(`/recordatorios?tipo=${tipo}&salaId=2`, ENFERMERO);
    expect(await screen.findByText(`${vacio} en Sala B – Traumatología.`)).toBeInTheDocument();
  });
});

describe('sonido de los avisos en esta tablet', () => {
  it('el interruptor está prendido por defecto y apagarlo se recuerda en la tablet', async () => {
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);
    const interruptor = await screen.findByRole('switch', { name: 'Sonido de avisos' });
    expect(interruptor).toBeChecked();

    await userEvent.click(interruptor);

    expect(interruptor).not.toBeChecked();
    expect(localStorage.getItem('sgsm.sonidoAvisos')).toBe('no');
  });
});
