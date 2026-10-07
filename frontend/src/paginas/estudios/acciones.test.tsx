import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import {
  ESTUDIOS,
  conEstudios,
  contarRecordatorios,
  errorApi,
  estudio,
  localEnHoras,
  prepararEstudios,
  restaurarEstudios,
  validarRostro,
} from '../../pruebas/datosEstudios';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { campoFechaHora, isoDeCampoFechaHora } from '../../utilidades/campoFechaHora';

beforeEach(prepararEstudios);
afterEach(restaurarEstudios);

const RUTA = '/pacientes/7?pestana=estudios';
const RX = 'Rx de tórax frente y perfil';

/** Registra los cuerpos que llegan a `ruta` y responde con `respuesta`. */
function capturar(
  metodo: 'post' | 'patch',
  ruta: string,
  respuesta: () => Response = () => HttpResponse.json({ data: estudio() }),
) {
  const enviados: unknown[] = [];
  servidor.use(
    http[metodo](ruta, async ({ request }) => {
      enviados.push(await request.json());
      return respuesta();
    }),
  );
  return enviados;
}

describe('reprogramar un estudio (T512)', () => {
  async function abrirReprogramar() {
    renderizarApp(RUTA, MEDICO);
    await userEvent.click(await screen.findByRole('button', { name: `Reprogramar ${RX}` }));
    return screen.findByRole('dialog', { name: 'Reprogramar estudio' });
  }

  it('el campo trae la hora actual, no deja confirmar sin cambiarla y manda la nueva', async () => {
    const nueva = localEnHoras(30);
    const enviados = capturar('patch', '*/api/estudios/60', () =>
      HttpResponse.json({ data: estudio({ fechaHora: isoDeCampoFechaHora(nueva) }) }),
    );
    const pedidos = conEstudios(...ESTUDIOS);
    const d = await abrirReprogramar();

    expect(d).toHaveTextContent(RX);
    expect(d).toHaveTextContent('Benítez, Rosa');
    expect(d).toHaveTextContent('DNI 30111222');
    expect(d).toHaveTextContent(/08\/10\/2026\s10:00/);
    const campo = within(d).getByLabelText(/^Nueva fecha y hora/);
    expect(campo).toHaveValue(campoFechaHora('2026-10-08T13:00:00.000Z'));
    const confirmar = within(d).getByRole('button', { name: 'Reprogramar' });
    expect(confirmar).toBeDisabled();

    fireEvent.change(campo, { target: { value: nueva } });
    expect(confirmar).toBeEnabled();
    const antes = pedidos.lista;
    await userEvent.click(confirmar);

    expect(await screen.findByText(new RegExp(`Se reprogramó ${RX} para el`))).toBeVisible();
    expect(enviados).toEqual([{ fechaHora: isoDeCampoFechaHora(nueva) }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(pedidos.lista).toBeGreaterThan(antes));
  });

  it('si el servidor responde que no hubo cambios (SIN_CAMBIOS), lo dice en el campo', async () => {
    capturar('patch', '*/api/estudios/60', () =>
      errorApi(422, 'SIN_CAMBIOS', 'El estudio ya está programado para esa fecha y hora'),
    );
    const d = await abrirReprogramar();

    const campo = within(d).getByLabelText(/^Nueva fecha y hora/);
    fireEvent.change(campo, { target: { value: localEnHoras(5) } });
    await userEvent.click(within(d).getByRole('button', { name: 'Reprogramar' }));

    await waitFor(() =>
      expect(campo).toHaveAccessibleDescription(
        /ya estaba programado para esa fecha y hora\. Elija otra/,
      ),
    );
    expect(screen.getByRole('dialog', { name: 'Reprogramar estudio' })).toBeInTheDocument();
  });

  it('avisa si la nueva fecha no está entre 5 min atrás y 90 días adelante, sin mandarla', async () => {
    const enviados = capturar('patch', '*/api/estudios/60');
    const d = await abrirReprogramar();

    const campo = within(d).getByLabelText(/^Nueva fecha y hora/);
    fireEvent.change(campo, { target: { value: localEnHoras(-2) } });

    expect(campo).toHaveAccessibleDescription(/entre 5\smin atrás y 90\sdías adelante/);
    expect(within(d).getByRole('button', { name: 'Reprogramar' })).toBeDisabled();
    expect(enviados).toHaveLength(0);
  });
});

describe('cancelar un estudio (T512)', () => {
  async function abrirCancelar() {
    renderizarApp(RUTA, MEDICO);
    await userEvent.click(await screen.findByRole('button', { name: `Cancelar estudio ${RX}` }));
    return screen.findByRole('dialog', { name: 'Cancelar el estudio' });
  }

  it('nombra el estudio y al paciente, pide el motivo y manda la cancelación', async () => {
    const enviados = capturar('post', '*/api/estudios/60/cancelar', () =>
      HttpResponse.json({
        data: estudio({ estado: 'CANCELADO', motivoCancelacion: 'Se suspendió el turno' }),
      }),
    );
    const d = await abrirCancelar();

    expect(d).toHaveTextContent(RX);
    expect(d).toHaveTextContent('Benítez, Rosa');
    expect(d).toHaveTextContent('DNI 30111222');
    expect(d).toHaveTextContent(/No se puede deshacer/);
    const confirmar = within(d).getByRole('button', { name: 'Cancelar estudio' });
    // El rojo relleno aparece recién en el diálogo, y solo con el motivo escrito.
    expect(confirmar).toHaveClass('MuiButton-contained', 'MuiButton-colorError');
    expect(confirmar).toBeDisabled();
    await userEvent.type(
      within(d).getByLabelText(/^Motivo de la cancelación/),
      'Se suspendió el turno',
    );
    await userEvent.click(confirmar);

    const exito = await screen.findByText(new RegExp(`Se canceló ${RX}`));
    expect(exito).toBeVisible();
    expect(enviados).toEqual([{ motivo: 'Se suspendió el turno' }]);
    // Como en el panel: el botón que abrió el diálogo ya no está; el aviso toma el foco (E5-09).
    await waitFor(() => expect(exito.closest('.MuiAlert-root')).toHaveFocus());
  });

  it('Volver cierra sin cancelar nada', async () => {
    const enviados = capturar('post', '*/api/estudios/60/cancelar');
    const d = await abrirCancelar();

    await userEvent.click(within(d).getByRole('button', { name: 'Volver' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(enviados).toHaveLength(0);
  });

  it('si otra persona ya lo confirmó o canceló (409), lo dice y recarga la lista', async () => {
    capturar('post', '*/api/estudios/60/cancelar', () =>
      errorApi(409, 'ESTUDIO_NO_PROGRAMADO', 'El estudio no está programado'),
    );
    const pedidos = conEstudios(...ESTUDIOS);
    const d = await abrirCancelar();
    const antes = pedidos.lista;

    await userEvent.type(within(d).getByLabelText(/^Motivo de la cancelación/), 'Turno suspendido');
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar estudio' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      // Puede haber sido la misma persona desde otra tablet (E5-14).
      'Este estudio ya estaba confirmado o cancelado (por usted o por otra persona). Revise el historial.',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(pedidos.lista).toBeGreaterThan(antes));
  });
});

describe('confirmar con el rostro que el estudio se realizó (T513 · S15)', () => {
  async function abrirConfirmar() {
    renderizarApp(RUTA, ENFERMERO);
    await userEvent.click(
      await screen.findByRole('button', { name: `Confirmar que se realizó ${RX}` }),
    );
    return screen.findByRole('dialog', { name: 'Confirmar que se realizó el estudio' });
  }

  const confirmarConRostro = (d: HTMLElement) =>
    userEvent.click(within(d).getByRole('button', { name: 'Confirmar con mi rostro' }));

  const simularRostro = async () =>
    userEvent.click(await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }));

  it('muestra qué se confirma, pide el rostro y manda el comprobante con las observaciones', async () => {
    validarRostro();
    const recordatorios = contarRecordatorios();
    const pedidos = conEstudios(...ESTUDIOS);
    const enviados = capturar('post', '*/api/estudios/60/confirmar', () =>
      HttpResponse.json({
        data: estudio({
          estado: 'REALIZADO',
          realizadoEn: new Date().toISOString(),
          confirmadoPor: { id: 3, nombre: 'Acosta, Sofía' },
          observacionesRealizacion: 'Sin novedad',
        }),
      }),
    );
    const d = await abrirConfirmar();

    // Qué estudio y a qué paciente, antes de mirar a la cámara.
    expect(await within(d).findByText(RX)).toBeVisible();
    expect(d).toHaveTextContent('Radiografía');
    expect(d).toHaveTextContent(/08\/10\/2026\s10:00/);
    expect(d).toHaveTextContent('Retirar alhajas y objetos metálicos');
    expect(d).toHaveTextContent('Benítez, Rosa');
    expect(d).toHaveTextContent('DNI 30111222');
    expect(d).toHaveTextContent(/Cama A.01/);
    await userEvent.type(within(d).getByLabelText(/^Observaciones/), 'Sin novedad');
    await confirmarConRostro(d);

    const validacion = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(validacion).toHaveTextContent(RX);
    expect(validacion).toHaveTextContent('Benítez, Rosa');
    await waitFor(() => expect(recordatorios.total).toBeGreaterThan(0));
    const antes = { lista: pedidos.lista, recordatorios: recordatorios.total };
    await simularRostro();

    expect(await screen.findByText(new RegExp(`Se confirmó que se realizó ${RX}`))).toBeVisible();
    expect(enviados).toEqual([{ validacionToken: 'tok-ok', observaciones: 'Sin novedad' }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(pedidos.lista).toBeGreaterThan(antes.lista));
    await waitFor(() => expect(recordatorios.total).toBeGreaterThan(antes.recordatorios));
  });

  it('si se cancela la validación facial no confirma nada', async () => {
    const enviados = capturar('post', '*/api/estudios/60/confirmar');
    const d = await abrirConfirmar();

    await within(d).findByText(RX);
    await confirmarConRostro(d);
    const validacion = await screen.findByRole('dialog', { name: /Confirmar con su rostro/ });
    await userEvent.click(within(validacion).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /Confirmar con su rostro/ }),
      ).not.toBeInTheDocument(),
    );
    expect(enviados).toHaveLength(0);
    // Sigue en el diálogo del estudio, para volver a intentar.
    expect(
      screen.getByRole('dialog', { name: 'Confirmar que se realizó el estudio' }),
    ).toBeVisible();
  });

  it('si la validación venció o no corresponde (403), pide volver a validarla', async () => {
    validarRostro();
    capturar('post', '*/api/estudios/60/confirmar', () =>
      errorApi(403, 'VALIDACION_FACIAL_REQUERIDA', 'Se requiere validación facial'),
    );
    const d = await abrirConfirmar();

    await within(d).findByText(RX);
    await confirmarConRostro(d);
    await simularRostro();

    const aviso = await within(d).findByRole('alert');
    expect(aviso).toHaveTextContent(
      'La validación del rostro venció o no corresponde; vuelva a validarla',
    );
    // Se lleva a la vista y toma el foco: está arriba, lejos del botón tocado (E5-10).
    await waitFor(() => expect(aviso).toHaveFocus());
    expect(within(d).getByRole('button', { name: 'Confirmar con mi rostro' })).toBeEnabled();
  });

  it('si otra persona ya lo confirmó o canceló (409), cierra, lo dice y recarga la lista', async () => {
    validarRostro();
    const pedidos = conEstudios(...ESTUDIOS);
    capturar('post', '*/api/estudios/60/confirmar', () =>
      HttpResponse.json(
        {
          error: {
            codigo: 'ESTUDIO_NO_PROGRAMADO',
            mensaje: 'El estudio no está programado',
            detalles: { estado: 'REALIZADO' },
          },
        },
        { status: 409 },
      ),
    );
    const d = await abrirConfirmar();
    await within(d).findByText(RX);
    const antes = pedidos.lista;

    await confirmarConRostro(d);
    await simularRostro();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      // Puede haber sido la misma persona desde otra tablet (E5-14).
      'Este estudio ya estaba confirmado o cancelado (por usted o por otra persona). Revise el historial.',
    );
    await waitFor(() => expect(pedidos.lista).toBeGreaterThan(antes));
  });
});

describe('reprogramar: la fecha y hora es siempre la de Argentina (E5-16)', () => {
  // La zona del sistema, para dejarla como estaba: borrar TZ deja UTC, no la del sistema.
  const zonaOriginal = process.env.TZ;
  const zonaDelSistema = Intl.DateTimeFormat().resolvedOptions().timeZone;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T15:00:00.000Z'));
    process.env.TZ = 'Asia/Tokyo';
  });
  afterEach(() => {
    process.env.TZ = zonaOriginal ?? zonaDelSistema;
    vi.useRealTimers();
  });

  it('con la tablet en otra zona, el campo trae la hora de Argentina y dice cómo quedará antes de confirmar', async () => {
    const enviados = capturar('patch', '*/api/estudios/60', () =>
      HttpResponse.json({ data: estudio({ fechaHora: '2026-10-09T11:30:00.000Z' }) }),
    );
    renderizarApp(RUTA, MEDICO);
    await userEvent.click(await screen.findByRole('button', { name: `Reprogramar ${RX}` }));
    const d = await screen.findByRole('dialog', { name: 'Reprogramar estudio' });

    const campo = within(d).getByLabelText(/^Nueva fecha y hora/);
    // 13:00 UTC = 10:00 en Argentina (en Tokio serían las 22:00).
    expect(campo).toHaveValue('2026-10-08T10:00');
    fireEvent.change(campo, { target: { value: '2026-10-09T08:30' } });
    expect(campo).toHaveAccessibleDescription(/^Quedará para el 09\/10\/2026\s08:30$/);
    await userEvent.click(within(d).getByRole('button', { name: 'Reprogramar' }));

    await waitFor(() => expect(enviados).toEqual([{ fechaHora: '2026-10-09T11:30:00.000Z' }]));
  });
});
