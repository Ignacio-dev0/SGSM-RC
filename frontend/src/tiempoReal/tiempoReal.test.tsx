import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { UsuarioSesion } from '../api/tipos';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';
import {
  AHORA_SERVIDOR,
  RECORDATORIOS,
  avisarCambio,
  fijarHoraTablet,
  registrarConexiones,
  respuestaRecordatorios,
  simularRecordatorios,
} from '../pruebas/datosRecordatorios';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';

/** Cuenta los pedidos de la lista de recordatorios (y la contesta). */
function contarPedidosDeLista() {
  const pedidos: URL[] = [];
  servidor.use(
    http.get('*/api/recordatorios', ({ request }) => {
      pedidos.push(new URL(request.url));
      return respuestaRecordatorios(RECORDATORIOS);
    }),
  );
  return pedidos;
}

/** Web Audio y vibración falsos: cuentan las notas y las vibraciones. */
function simularAudioYVibracion() {
  const notas: number[] = [];
  class ContextoFalso {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = async () => {};
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: (d: unknown) => d,
      };
    }
    createOscillator() {
      const frecuencia = { value: 0 };
      return {
        type: 'sine',
        frequency: frecuencia,
        connect: (d: unknown) => d,
        start: () => notas.push(frecuencia.value),
        stop() {},
      };
    }
  }
  vi.stubGlobal('AudioContext', ContextoFalso);
  const vibrar = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { value: vibrar, configurable: true });
  return { notas, vibrar };
}

/**
 * La insignia ya muestra la lista: un aviso que llegue ahora hace un pedido nuevo (mientras la
 * primera carga está en curso, React Query la reutiliza en lugar de pedir otra).
 */
const listaCargada = () =>
  screen.findByRole('link', { name: 'Recordatorios: 4 para atender, 2 urgentes' });

const regionDeAvisos = () =>
  document.querySelector<HTMLElement>('[aria-live="polite"][data-avisos-recordatorios]')!;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('conexión de tiempo real en la plantilla (T505)', () => {
  it('solo se conecta si la sesión tiene recordatorios.ver', async () => {
    const conexiones = registrarConexiones();
    const pedidos = contarPedidosDeLista();
    const sinRecordatorios: UsuarioSesion = {
      ...ENFERMERO,
      permisos: ENFERMERO.permisos.filter((p) => !p.startsWith('recordatorios.')),
    };
    renderizarApp('/', sinRecordatorios);

    await screen.findByRole('heading', { name: /Hola, Sofía/ });
    // Lo que la pantalla tuviera que pedir ya se pidió: ni lista ni conexión.
    await new Promise((r) => setTimeout(r, 50));
    expect(conexiones).toHaveLength(0);
    expect(pedidos).toHaveLength(0);
  });

  it('al reconectarse vuelve a pedir la lista (resincroniza lo perdido); al volver la red no espera', async () => {
    const conexiones = registrarConexiones();
    const pedidos = contarPedidosDeLista();
    renderizarApp('/', MEDICO);
    await listaCargada();
    await waitFor(() => expect(conexiones).toHaveLength(1));
    const antes = pedidos.length;

    // El servidor se reinicia; la red de la tablet vuelve enseguida.
    conexiones[0]!.close(1001, 'Reinicio');
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(conexiones).toHaveLength(2));
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antes));
  });

  it('cada aviso de cambio vuelve a pedir la lista; con vencidos, también las notificaciones', async () => {
    const conexiones = registrarConexiones();
    const pedidos = contarPedidosDeLista();
    let pedidosDeNotificaciones = 0;
    renderizarApp('/', ADMIN);
    servidor.use(
      http.get('*/api/notificaciones', () => {
        pedidosDeNotificaciones++;
        return HttpResponse.json({ data: [], meta: { noLeidas: 0 } });
      }),
    );
    await listaCargada();
    await waitFor(() => expect(conexiones).toHaveLength(1));
    const antes = pedidos.length;
    const notificacionesAntes = pedidosDeNotificaciones;

    avisarCambio(0, 0);
    await waitFor(() => expect(pedidos.length).toBe(antes + 1));
    expect(pedidosDeNotificaciones).toBe(notificacionesAntes);

    avisarCambio(0, 2);
    await waitFor(() => expect(pedidos.length).toBe(antes + 2));
    await waitFor(() => expect(pedidosDeNotificaciones).toBe(notificacionesAntes + 1));
  });

  it('si la sesión de la conexión vence dos veces seguidas (4001), la sesión terminó: vuelve al ingreso', async () => {
    const conexiones = registrarConexiones((cliente, numero) => {
      // La reconexión inmediata tampoco tiene sesión: el servidor la cierra sin "conectado".
      if (numero > 1) cliente.close(4001, 'Sesión vencida');
    });
    renderizarApp('/', ENFERMERO);
    await screen.findByRole('heading', { name: /Hola, Sofía/ });
    await waitFor(() => expect(conexiones).toHaveLength(1));

    servidor.use(
      http.get('*/api/auth/sesion', () =>
        HttpResponse.json(
          { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Sesión no iniciada o vencida' } },
          { status: 401 },
        ),
      ),
    );
    conexiones[0]!.close(4001, 'Sesión vencida');

    expect(await screen.findByRole('heading', { name: /Ingresar/ })).toBeInTheDocument();
    expect(conexiones).toHaveLength(2);
  });

  it('si la reconexión por 4001 recibe "conectado", sigue con la sesión abierta', async () => {
    const conexiones = registrarConexiones();
    renderizarApp('/', ENFERMERO);
    await waitFor(() => expect(conexiones).toHaveLength(1));

    conexiones[0]!.close(4001, 'Sesión vencida');

    await waitFor(() => expect(conexiones).toHaveLength(2));
    expect(screen.getByRole('heading', { name: /Hola, Sofía/ })).toBeInTheDocument();
  });

  it('sin permiso (4003) no reconecta y vuelve a pedir la sesión para actualizar los permisos', async () => {
    const sinPermiso: UsuarioSesion = {
      ...ENFERMERO,
      permisos: ENFERMERO.permisos.filter((p) => !p.startsWith('recordatorios.')),
    };
    const conexiones = registrarConexiones((cliente) => {
      servidor.use(http.get('*/api/auth/sesion', () => HttpResponse.json({ data: sinPermiso })));
      cliente.close(4003, 'Sin permiso');
    });
    renderizarApp('/', ENFERMERO);
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(within(menu).getByRole('link', { name: 'Recordatorios' })).toBeInTheDocument();

    await waitFor(() =>
      expect(within(menu).queryByRole('link', { name: 'Recordatorios' })).not.toBeInTheDocument(),
    );
    expect(conexiones).toHaveLength(1);
  });
});

describe('sin conexión en tiempo real', () => {
  it('avisa con una franja y vuelve a pedir la lista cada 30 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    // El servidor se reinicia una y otra vez: cada intento cierra con 1001.
    registrarConexiones((cliente) => cliente.close(1001, 'Reinicio'));
    simularRecordatorios();
    const pedidos = contarPedidosDeLista();
    renderizarApp('/recordatorios', ENFERMERO);

    expect(
      await screen.findByText('Sin conexión en tiempo real: la lista se actualiza cada 30 s'),
    ).toBeInTheDocument();
    await waitFor(() => expect(pedidos.length).toBeGreaterThanOrEqual(1));
    const antes = pedidos.length;

    act(() => vi.advanceTimersByTime(30_000));
    await waitFor(() => expect(pedidos.length).toBe(antes + 1));
    act(() => vi.advanceTimersByTime(30_000));
    await waitFor(() => expect(pedidos.length).toBe(antes + 2));
  });

  it('con la conexión abierta no muestra la franja', async () => {
    const conexiones = registrarConexiones();
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);

    await screen.findAllByRole('listitem');
    await waitFor(() => expect(conexiones).toHaveLength(1));
    expect(screen.queryByText(/Sin conexión en tiempo real/)).not.toBeInTheDocument();
  });
});

describe('aviso de recordatorios nuevos (S16)', () => {
  it('a quien atiende: texto en una región aria-live, tono corto y vibración', async () => {
    const { notas, vibrar } = simularAudioYVibracion();
    const conexiones = registrarConexiones();
    renderizarApp('/', ENFERMERO);
    await waitFor(() => expect(conexiones).toHaveLength(1));
    expect(regionDeAvisos()).toHaveAttribute('aria-atomic', 'true');

    avisarCambio(2, 0);

    await waitFor(() => expect(regionDeAvisos()).toHaveTextContent('2 recordatorios nuevos'));
    expect(vibrar).toHaveBeenCalledTimes(1);
    expect(notas.length).toBeGreaterThan(0);
    // A la vista también, con el camino a la lista.
    expect(screen.getByRole('button', { name: 'Ver recordatorios' })).toBeInTheDocument();
  });

  it('como mucho un aviso cada 10 s: lo que llega antes se junta en el siguiente', async () => {
    const { vibrar } = simularAudioYVibracion();
    const conexiones = registrarConexiones();
    const pedidos = contarPedidosDeLista();
    renderizarApp('/', ENFERMERO);
    await waitFor(() => expect(conexiones).toHaveLength(1));

    avisarCambio(1, 0);
    await waitFor(() => expect(regionDeAvisos()).toHaveTextContent('1 recordatorio nuevo'));
    const antes = pedidos.length;
    avisarCambio(3, 0);
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antes));

    expect(vibrar).toHaveBeenCalledTimes(1);
    expect(regionDeAvisos()).toHaveTextContent('1 recordatorio nuevo');
  });

  it('con el sonido desactivado en la tablet avisa solo con el texto', async () => {
    localStorage.setItem('sgsm.sonidoAvisos', 'no');
    const { notas, vibrar } = simularAudioYVibracion();
    const conexiones = registrarConexiones();
    renderizarApp('/', ENFERMERO);
    await waitFor(() => expect(conexiones).toHaveLength(1));

    avisarCambio(1, 0);

    await waitFor(() => expect(regionDeAvisos()).toHaveTextContent('1 recordatorio nuevo'));
    expect(vibrar).not.toHaveBeenCalled();
    expect(notas).toHaveLength(0);
  });

  it('a quien solo ve los recordatorios (médico) no le avisa', async () => {
    const { vibrar } = simularAudioYVibracion();
    const conexiones = registrarConexiones();
    const pedidos = contarPedidosDeLista();
    renderizarApp('/', MEDICO);
    await listaCargada();
    await waitFor(() => expect(conexiones).toHaveLength(1));
    const antes = pedidos.length;

    avisarCambio(2, 0);
    await waitFor(() => expect(pedidos.length).toBe(antes + 1));

    expect(screen.queryByText(/recordatorios? nuevos?/)).not.toBeInTheDocument();
    expect(vibrar).not.toHaveBeenCalled();
  });

  it('el aviso se puede cerrar', async () => {
    const conexiones = registrarConexiones();
    renderizarApp('/', ENFERMERO);
    await waitFor(() => expect(conexiones).toHaveLength(1));
    avisarCambio(1, 0);
    await waitFor(() => expect(regionDeAvisos()).toHaveTextContent('1 recordatorio nuevo'));

    act(() => screen.getByRole('button', { name: 'Cerrar el aviso' }).click());

    expect(regionDeAvisos()).toHaveTextContent('');
    expect(screen.queryByRole('button', { name: 'Ver recordatorios' })).not.toBeInTheDocument();
  });
});

describe('hora del servidor (R6)', () => {
  it('el momento de cada aviso corrige el reloj de la tablet', async () => {
    // La tablet atrasa 10 min; la lista y los avisos traen la hora del servidor.
    fijarHoraTablet(new Date(Date.parse(AHORA_SERVIDOR) - 10 * 60_000).toISOString());
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);

    const tarjetas = await screen.findAllByRole('listitem');
    await waitFor(() => expect(tarjetas[2]).toHaveTextContent(/Faltan 12\smin/));
  });
});
