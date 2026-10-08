// Administrar: la toma que ya se dio (C1 · F1) y los tres intentos fallidos del rostro (F4).
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO } from '../../pruebas/datos';
import {
  enMinutos,
  prepararSuministros,
  suministro,
  validarRostro,
  vigente,
} from '../../pruebas/datosSuministros';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';
import { formatearHora } from '../../utilidades/formato';

beforeEach(prepararSuministros);
afterEach(() => vi.unstubAllEnvs());

const RUTA = '/suministros/medicamento?pacienteId=7';

/** Paracetamol con una administración de hace 10 minutos: la toma de ahora ya se dio. */
const yaDada = (fechaHora = enMinutos(-10)) => ({
  ...vigente,
  proximaToma: enMinutos(470),
  ultimasAdministraciones: [{ id: 1, fechaHora, cantidad: 500, usuario: 'Acosta, Sofía' }],
});

/** Registra lo que se manda al servidor y contesta con el registro hecho. */
function registrarEnviados() {
  const enviados: Record<string, unknown>[] = [];
  servidor.use(
    http.post('*/api/suministros/medicamentos', async ({ request }) => {
      enviados.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ data: suministro() }, { status: 201 });
    }),
  );
  return enviados;
}

/** Cuenta los pedidos de las prescripciones del paciente; contesta con lo que diga `datos()`. */
function contarPedidos(datos: () => object[] = () => [vigente]) {
  const pedidos = { n: 0 };
  servidor.use(
    http.get('*/api/pacientes/7/prescripciones', () => {
      pedidos.n += 1;
      return HttpResponse.json({ data: datos() });
    }),
  );
  return pedidos;
}

async function confirmarConRostro() {
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar con mi rostro' }));
  await userEvent.click(
    await screen.findByRole('button', { name: /Simular el rostro de enfermero/ }),
  );
}

describe('otra toma a propósito (C1 · F1)', () => {
  it('sin la casilla marcada no pide registrar otra toma', async () => {
    validarRostro();
    const enviados = registrarEnviados();
    renderizarApp(RUTA, ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await confirmarConRostro();

    await screen.findByRole('status');
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.otraToma).not.toBe(true);
  });

  it('con «Corresponde dar otra toma» marcada manda otraToma: true', async () => {
    validarRostro();
    contarPedidos(() => [yaDada()]);
    const enviados = registrarEnviados();
    renderizarApp(RUTA, ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Corresponde dar otra toma/ }));
    await confirmarConRostro();

    await screen.findByRole('status');
    expect(enviados[0]).toMatchObject({ prescripcionId: 40, otraToma: true });
  });
});

describe('el servidor dice que la toma ya se dio (409 TOMA_YA_DADA)', () => {
  const scrollIntoView = vi.fn();
  beforeEach(() => {
    // jsdom no implementa scrollIntoView.
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('la misma toma (MISMA_TOMA): lo dice con la hora y quién, con el foco, y vuelve a pedir la prescripción', async () => {
    validarRostro();
    const dadaA = enMinutos(-5);
    // Otra persona la dio mientras la pantalla estaba abierta: la tablet no lo sabía.
    let dada = false;
    const pedidos = contarPedidos(() => [dada ? yaDada(dadaA) : vigente]);
    const enviados: Record<string, unknown>[] = [];
    servidor.use(
      http.post('*/api/suministros/medicamentos', async ({ request }) => {
        const cuerpo = (await request.json()) as Record<string, unknown>;
        enviados.push(cuerpo);
        if (cuerpo.otraToma === true) {
          return HttpResponse.json({ data: suministro() }, { status: 201 });
        }
        dada = true;
        return HttpResponse.json(
          {
            error: {
              codigo: 'TOMA_YA_DADA',
              mensaje: 'Esa toma ya tiene una administración registrada',
              detalles: { motivo: 'MISMA_TOMA', fechaHora: dadaA, usuario: 'Acosta, Sofía' },
            },
          },
          { status: 409 },
        );
      }),
    );
    renderizarApp(RUTA, ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    const antes = pedidos.n;
    await confirmarConRostro();

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(
      `Esta toma ya se registró a las ${formatearHora(dadaA)} (Acosta, Sofía). Si corresponde dar otra, márquelo y vuelva a confirmar.`,
    );
    expect(aviso.closest('[tabindex="-1"]')).toHaveFocus();
    await waitFor(() => expect(pedidos.n).toBeGreaterThan(antes));
    // La tarjeta ya lo dice y el formulario pide la casilla antes de confirmar.
    expect(await screen.findByText(`Ya se dio a las ${formatearHora(dadaA)}`)).toBeVisible();
    const confirmar = screen.getByRole('button', { name: 'Confirmar con mi rostro' });
    expect(confirmar).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /Corresponde dar otra toma/ }));
    await confirmarConRostro();

    expect(await screen.findByRole('status')).toHaveTextContent(/Se registró Paracetamol/);
    expect(enviados.at(-1)).toMatchObject({ otraToma: true });
  });

  it('una dosis reciente de otra toma (DOSIS_RECIENTE): dice hace cuánto, a qué hora y quién, sin hablar de "esta toma"', async () => {
    validarRostro();
    // Se dio hace 40 minutos, antes de que reanudaran la prescripción: es de otra toma (D123).
    const dadaA = enMinutos(-40);
    contarPedidos(() => [vigente]);
    const enviados: Record<string, unknown>[] = [];
    servidor.use(
      http.post('*/api/suministros/medicamentos', async ({ request }) => {
        const cuerpo = (await request.json()) as Record<string, unknown>;
        enviados.push(cuerpo);
        if (cuerpo.otraToma === true) {
          return HttpResponse.json({ data: suministro() }, { status: 201 });
        }
        return HttpResponse.json(
          {
            error: {
              codigo: 'TOMA_YA_DADA',
              mensaje:
                'Ya se dio una dosis a las 11:20 (Acosta, Sofía), hace 40 min, y la indicación es cada 8 h.',
              detalles: { motivo: 'DOSIS_RECIENTE', fechaHora: dadaA, usuario: 'Acosta, Sofía' },
            },
          },
          { status: 409 },
        );
      }),
    );
    renderizarApp(RUTA, ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await confirmarConRostro();

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(
      `Hace 40 min se registró una dosis de este medicamento (a las ${formatearHora(dadaA)}, Acosta, Sofía). Si corresponde dar otra, márquelo y vuelva a confirmar.`,
    );
    expect(aviso).not.toHaveTextContent(/Esta toma/);
    expect(aviso.closest('[tabindex="-1"]')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Confirmar con mi rostro' })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: /Corresponde dar otra toma/ }));
    await confirmarConRostro();

    expect(await screen.findByRole('status')).toHaveTextContent(/Se registró Paracetamol/);
    expect(enviados.at(-1)).toMatchObject({ otraToma: true });
  });

  it('aunque la prescripción renovada no lo muestre, deja marcar la casilla para registrar otra', async () => {
    validarRostro();
    contarPedidos(() => [vigente]);
    servidor.use(
      http.post('*/api/suministros/medicamentos', () =>
        HttpResponse.json(
          {
            error: {
              codigo: 'TOMA_YA_DADA',
              mensaje: 'Esa toma ya tiene una administración registrada',
              detalles: { fechaHora: enMinutos(-50), usuario: 'Acosta, Sofía' },
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderizarApp(RUTA, ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await confirmarConRostro();

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Confirmar con mi rostro' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Corresponde dar otra toma/ })).not.toBeChecked();
  });
});

describe('la pantalla se mantiene al día (F1)', () => {
  it('vuelve a pedir las prescripciones al volver a la pantalla (pestaña o tablet que se despierta)', async () => {
    const pedidos = contarPedidos();
    renderizarApp(RUTA, ENFERMERO);
    await screen.findByRole('button', { name: /Paracetamol 500\smg/ });
    const antes = pedidos.n;

    const visibilidad = vi.spyOn(document, 'visibilityState', 'get');
    try {
      visibilidad.mockReturnValue('hidden');
      act(() => void document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
      visibilidad.mockReturnValue('visible');
      act(() => void document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));

      await waitFor(() => expect(pedidos.n).toBe(antes + 1));
    } finally {
      visibilidad.mockRestore();
    }
  });

  it('y cada 60 segundos, para que "ya se dio" esté al día', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const pedidos = contarPedidos();
      renderizarApp(RUTA, ENFERMERO);
      await screen.findByRole('button', { name: /Paracetamol 500\smg/ });
      const antes = pedidos.n;

      act(() => void vi.advanceTimersByTime(59_000));
      expect(pedidos.n).toBe(antes);
      act(() => void vi.advanceTimersByTime(1_000));
      // waitFor también usa setInterval para volver a mirar: se le devuelve el reloj real.
      vi.useRealTimers();

      await waitFor(() => expect(pedidos.n).toBe(antes + 1));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('la prescripción elegida deja de estar vigente mientras se mira la pantalla', () => {
  it('al renovar la lista lo dice (con el foco) en lugar de vaciar el formulario en silencio', async () => {
    let vigentes: object[] = [vigente];
    contarPedidos(() => vigentes);
    renderizarApp(RUTA, ENFERMERO);
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Con agua');

    // El médico la suspendió desde otra tablet; la pantalla vuelve a pedir la lista.
    vigentes = [];
    const visibilidad = vi.spyOn(document, 'visibilityState', 'get');
    try {
      visibilidad.mockReturnValue('visible');
      act(() => void document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));

      const aviso = await screen.findByText(/ya no está vigente/);
      expect(aviso).toHaveTextContent(
        'La prescripción de Paracetamol ya no está vigente: la suspendieron o la finalizaron mientras tenía la pantalla abierta. No se registró nada.',
      );
      await waitFor(() => expect(aviso.closest('[tabindex="-1"]')).toHaveFocus());
    } finally {
      visibilidad.mockRestore();
    }
    // No queda un formulario para confirmar algo que el servidor va a rechazar.
    expect(
      screen.queryByRole('button', { name: 'Confirmar con mi rostro' }),
    ).not.toBeInTheDocument();
  });
});

describe('tres intentos fallidos del rostro (F4)', () => {
  it('dice claramente que la administración NO se registró', async () => {
    const registrar = vi.fn(() => HttpResponse.json({ data: suministro() }, { status: 201 }));
    servidor.use(
      http.post('*/api/biometria/validar', () =>
        HttpResponse.json({ data: { valido: false, intentosRestantes: 0, cancelada: true } }),
      ),
      http.post('*/api/suministros/medicamentos', registrar),
    );
    renderizarApp(RUTA, ENFERMERO);

    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500\smg/ }));
    await confirmarConRostro();

    const dialogo = screen.getByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'No se registró la administración. Los tres intentos fallidos quedaron registrados y se avisó al administrador.',
    );
    expect(registrar).not.toHaveBeenCalled();
  });
});
