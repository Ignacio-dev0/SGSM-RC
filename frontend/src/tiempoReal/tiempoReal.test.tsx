import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { UsuarioSesion } from '../api/tipos';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';
import {
  AHORA_SERVIDOR,
  RECORDATORIOS,
  aLos,
  avisarCambio,
  fijarHoraTablet,
  recordatorio,
  registrarConexiones,
  respuestaRecordatorios,
  simularRecordatorios,
} from '../pruebas/datosRecordatorios';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';

/** Cuenta los pedidos de la lista de recordatorios (y la contesta con `lista()`). */
function contarPedidosDeLista(lista: () => typeof RECORDATORIOS = () => RECORDATORIOS) {
  const pedidos: URL[] = [];
  servidor.use(
    http.get('*/api/recordatorios', ({ request }) => {
      pedidos.push(new URL(request.url));
      return respuestaRecordatorios(lista());
    }),
  );
  return pedidos;
}

/** Dos tomas que aparecen después de la primera carga (generadas por el temporizador). */
const NUEVAS = [
  recordatorio({ id: 30, prioridad: 'BAJA', fechaHoraObjetivo: aLos(28) }),
  recordatorio({ id: 31, prioridad: 'BAJA', fechaHoraObjetivo: aLos(29) }),
];

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

/** Espera real (setTimeout no es falso en estas pruebas). */
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Como waitFor, pero sin setInterval: sirve con el setInterval falso y sin cambios en pantalla. */
async function esperarHasta(condicion: () => boolean, ms = 3_000) {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('No se cumplió a tiempo');
    await esperar(25);
  }
}

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

    // Lo que dice es cierto aun sin el socket: la lista y los avisos llegan cada 30 s (E5-03).
    expect(
      await screen.findByText(
        'Sin conexión en tiempo real: la lista y los avisos se actualizan cada 30 s.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(pedidos.length).toBeGreaterThanOrEqual(1));
    const antes = pedidos.length;

    act(() => vi.advanceTimersByTime(30_000));
    await waitFor(() => expect(pedidos.length).toBe(antes + 1));
    act(() => vi.advanceTimersByTime(30_000));
    await waitFor(() => expect(pedidos.length).toBe(antes + 2));
  });

  it('a quien no recibe avisos (médico) le habla solo de la lista', async () => {
    registrarConexiones((cliente) => cliente.close(1001, 'Reinicio'));
    simularRecordatorios();
    renderizarApp('/recordatorios', MEDICO);

    expect(
      await screen.findByText('Sin conexión en tiempo real: la lista se actualiza cada 30 s.'),
    ).toBeInTheDocument();
  });

  it('se nota también fuera del panel: la insignia lleva el ícono de sin señal y lo dice (E5-03)', async () => {
    registrarConexiones((cliente) => cliente.close(1001, 'Reinicio'));
    simularRecordatorios();
    renderizarApp('/', ENFERMERO);

    const insignia = await screen.findByRole('link', {
      name: 'Recordatorios: 4 para atender, 2 urgentes; sin avisos en tiempo real',
    });
    expect(within(insignia).getByTestId('WifiOffOutlinedIcon')).toBeInTheDocument();
  });

  it('con la conexión abierta, la insignia no lleva la marca de sin señal', async () => {
    const conexiones = registrarConexiones();
    simularRecordatorios();
    renderizarApp('/', ENFERMERO);
    await waitFor(() => expect(conexiones).toHaveLength(1));

    const insignia = await screen.findByRole('link', {
      name: 'Recordatorios: 4 para atender, 2 urgentes',
    });
    expect(within(insignia).queryByTestId('WifiOffOutlinedIcon')).not.toBeInTheDocument();
  });

  it('sin conexión, los recordatorios nuevos se avisan igual al consultar la lista (E5-03)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { vibrar } = simularAudioYVibracion();
    registrarConexiones((cliente) => cliente.close(1001, 'Reinicio'));
    let lista = RECORDATORIOS;
    const pedidos = contarPedidosDeLista(() => lista);
    renderizarApp('/', ENFERMERO);
    await screen.findByRole('link', { name: /^Recordatorios: 4 para atender/ });
    await screen.findByRole('link', { name: /sin avisos en tiempo real/ });
    // La primera carga no es "nueva": no avisa.
    expect(regionDeAvisos()).toHaveTextContent('');

    lista = [...RECORDATORIOS, ...NUEVAS];
    const antes = pedidos.length;
    act(() => vi.advanceTimersByTime(30_000));
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antes));

    await waitFor(() => expect(regionDeAvisos()).toHaveTextContent('2 recordatorios nuevos'));
    expect(vibrar).toHaveBeenCalledTimes(1);
  });

  it('al volver la conexión avisa lo que apareció durante el corte (el socket no lo mandó)', async () => {
    simularAudioYVibracion();
    const conexiones = registrarConexiones();
    let lista = RECORDATORIOS;
    contarPedidosDeLista(() => lista);
    renderizarApp('/', ENFERMERO);
    await listaCargada();
    await waitFor(() => expect(conexiones).toHaveLength(1));

    // Se corta; mientras tanto el temporizador generó dos. Al reconectar se resincroniza.
    lista = [...RECORDATORIOS, ...NUEVAS];
    conexiones[0]!.close(1001, 'Reinicio');

    await waitFor(() => expect(conexiones).toHaveLength(2));
    await waitFor(() => expect(regionDeAvisos()).toHaveTextContent('2 recordatorios nuevos'));
  });

  it('con la conexión abierta, lo nuevo lo avisa el socket una sola vez (no se cuenta dos veces)', async () => {
    const { vibrar } = simularAudioYVibracion();
    const conexiones = registrarConexiones();
    let lista = RECORDATORIOS;
    const pedidos = contarPedidosDeLista(() => lista);
    renderizarApp('/', ENFERMERO);
    await listaCargada();
    await waitFor(() => expect(conexiones).toHaveLength(1));

    lista = [...RECORDATORIOS, ...NUEVAS];
    const antes = pedidos.length;
    avisarCambio(2, 0);
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(antes));
    await screen.findByRole('link', { name: /^Recordatorios: 6 para atender/ });

    expect(regionDeAvisos()).toHaveTextContent('2 recordatorios nuevos');
    expect(vibrar).toHaveBeenCalledTimes(1);
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

describe('la lista no depende solo del socket (E5-04)', () => {
  it('al volver a la pantalla vuelve a pedir la lista aunque la conexión siga abierta', async () => {
    const conexiones = registrarConexiones();
    const pedidos = contarPedidosDeLista();
    renderizarApp('/', ENFERMERO);
    await listaCargada();
    await waitFor(() => expect(conexiones).toHaveLength(1));
    const antes = pedidos.length;

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(pedidos.length).toBe(antes + 1));
    expect(conexiones).toHaveLength(1);
  });

  it('al volver la red también la vuelve a pedir', async () => {
    const conexiones = registrarConexiones();
    const pedidos = contarPedidosDeLista();
    renderizarApp('/', ENFERMERO);
    await listaCargada();
    await waitFor(() => expect(conexiones).toHaveLength(1));
    const antes = pedidos.length;

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(pedidos.length).toBe(antes + 1));
  });

  it('con la conexión abierta, igual la vuelve a pedir cada 90 s por si se perdió un aviso', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const conexiones = registrarConexiones();
    const pedidos = contarPedidosDeLista();
    renderizarApp('/', ENFERMERO);
    await listaCargada();
    await waitFor(() => expect(conexiones).toHaveLength(1));
    const antes = pedidos.length;

    act(() => vi.advanceTimersByTime(60_000));
    await esperar(100);
    expect(pedidos.length).toBe(antes);
    act(() => vi.advanceTimersByTime(30_000));
    // waitFor revisa con setInterval (acá, falso) y la pantalla no cambia: se espera con setTimeout.
    await esperarHasta(() => pedidos.length === antes + 1);
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

  it('el aviso aparece arriba, en la franja fija bajo la barra: no tapa los botones de abajo (E5-05)', async () => {
    const conexiones = registrarConexiones();
    renderizarApp('/', ENFERMERO);
    await waitFor(() => expect(conexiones).toHaveLength(1));

    avisarCambio(1, 0);

    const franja = await screen.findByRole('note');
    await waitFor(() => expect(franja).toHaveTextContent('1 recordatorio nuevo'));
    expect(franja.parentElement).toBe(screen.getByRole('main'));
    expect(getComputedStyle(franja).position).toBe('sticky');
    expect(within(franja).getByRole('button', { name: 'Ver recordatorios' })).toBeInTheDocument();
    expect(within(franja).getByRole('button', { name: 'Cerrar el aviso' })).toBeInTheDocument();
  });

  it('con un diálogo abierto, el aviso igual se anuncia: la región no queda oculta (E5-05)', async () => {
    const conexiones = registrarConexiones();
    simularRecordatorios([recordatorio()]);
    renderizarApp('/recordatorios', ENFERMERO);
    await waitFor(() => expect(conexiones).toHaveLength(1));
    await act(async () =>
      (await screen.findByRole('button', { name: /^No se administró/ })).click(),
    );
    const dialogo = await screen.findByRole('dialog', { name: 'No se administró' });

    avisarCambio(1, 0);

    await waitFor(() => expect(regionDeAvisos()).toHaveTextContent('1 recordatorio nuevo'));
    await waitFor(() => expect(dialogo).toContainElement(regionDeAvisos()));
    expect(regionDeAvisos().closest('[aria-hidden="true"]')).toBeNull();
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

describe('el tono se repite mientras haya urgentes sin atender (ESC3)', () => {
  const CINCO_MIN = 5 * 60_000;

  async function conLista(usuario: UsuarioSesion, lista = RECORDATORIOS) {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const audio = simularAudioYVibracion();
    const conexiones = registrarConexiones();
    contarPedidosDeLista(() => lista);
    renderizarApp('/', usuario);
    await screen.findByRole('link', { name: /^Recordatorios: \d+ para atender/ });
    await waitFor(() => expect(conexiones).toHaveLength(1));
    return audio;
  }

  it('a quien atiende, con urgentes o vencidos, suena cada 5 min', async () => {
    const { notas } = await conLista(ENFERMERO);
    expect(notas).toHaveLength(0);

    act(() => vi.advanceTimersByTime(CINCO_MIN - 1_000));
    expect(notas).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1_000));
    expect(notas.length).toBeGreaterThan(0);
    const unTono = notas.length;
    act(() => vi.advanceTimersByTime(CINCO_MIN));
    expect(notas).toHaveLength(unTono * 2);
  });

  it('sin urgentes no se repite', async () => {
    const { notas } = await conLista(ENFERMERO, NUEVAS);

    act(() => vi.advanceTimersByTime(3 * CINCO_MIN));
    expect(notas).toHaveLength(0);
  });

  it('con el sonido apagado en la tablet no se repite', async () => {
    localStorage.setItem('sgsm.sonidoAvisos', 'no');
    const { notas } = await conLista(ENFERMERO);

    act(() => vi.advanceTimersByTime(3 * CINCO_MIN));
    expect(notas).toHaveLength(0);
  });

  it('a quien solo ve los recordatorios (médico) no le suena', async () => {
    const { notas } = await conLista(MEDICO);

    act(() => vi.advanceTimersByTime(3 * CINCO_MIN));
    expect(notas).toHaveLength(0);
  });
});
