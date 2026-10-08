// Panel de recordatorios: filtro de sala (E5-08 · E5-17 · ESC5) y pantalla encendida (ESC2).
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ENFERMERO, MEDICO } from '../../pruebas/datos';
import { SALAS } from '../../pruebas/datosPacientes';
import {
  RECORDATORIOS,
  fijarHoraTablet,
  respuestaRecordatorios,
  simularRecordatorios,
} from '../../pruebas/datosRecordatorios';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

beforeEach(() => fijarHoraTablet());
afterEach(() => vi.useRealTimers());

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

const OPCIONES = { name: 'Qué puede hacer ahora' };
const sala = () => screen.findByRole('combobox', { name: 'Sala' });

describe('filtro de sala del panel', () => {
  it('si la lista de salas no carga, lo dice en el filtro y deja reintentar (E5-08)', async () => {
    let fallar = true;
    simularRecordatorios();
    servidor.use(
      http.get('*/api/salas', () =>
        fallar
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno' } },
              { status: 500 },
            )
          : HttpResponse.json({ data: SALAS }),
      ),
    );
    renderizarApp('/recordatorios', ENFERMERO);

    const filtro = await sala();
    await waitFor(() =>
      expect(filtro).toHaveAccessibleDescription(/No se pudo cargar la lista de salas/),
    );
    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('option', { name: SALAS[1]!.nombre })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument(),
    );
  });

  it('una sala que no existe en la dirección se ignora, como un tipo desconocido (E5-17)', async () => {
    simularRecordatorios();
    const pedidos = contarPedidos();
    renderizarApp('/recordatorios?salaId=99', ENFERMERO);

    await screen.findByRole('option', { name: SALAS[0]!.nombre });
    expect(await sala()).toHaveValue('');
    await waitFor(() => expect(pedidos.at(-1)?.has('salaId')).toBe(false));
  });

  it('sin nada en la sala filtrada, ofrece "Quitar filtros" y vuelve a todo el hospital (E5-17)', async () => {
    simularRecordatorios();
    const pedidos = contarPedidos(() => respuestaRecordatorios([]));
    renderizarApp('/recordatorios?tipo=ESTUDIO&salaId=2', ENFERMERO);

    expect(
      await screen.findByText('No hay estudios para atender ahora en Sala B – Traumatología.'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('group', OPCIONES)).getByRole('button', { name: 'Quitar filtros' }),
    );

    expect(screen.getByLabelText('Tipo')).toHaveValue('');
    expect(await sala()).toHaveValue('');
    await waitFor(() => {
      expect(pedidos.at(-1)?.has('salaId')).toBe(false);
      expect(pedidos.at(-1)?.has('tipo')).toBe(false);
    });
    expect(await screen.findByText('No hay tomas ni estudios para atender ahora.')).toBeVisible();
    // Sin filtros no hay nada que quitar.
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).not.toBeInTheDocument();
  });

  it('sin filtros, el vacío no ofrece "Quitar filtros"', async () => {
    simularRecordatorios([]);
    renderizarApp('/recordatorios', ENFERMERO);

    await screen.findByText('No hay tomas ni estudios para atender ahora.');
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).not.toBeInTheDocument();
  });
});

describe('la tablet recuerda la última sala elegida (ESC5)', () => {
  it('al elegir una sala se recuerda; "Todas" la olvida', async () => {
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);
    await screen.findByRole('option', { name: SALAS[1]!.nombre });

    await userEvent.selectOptions(await sala(), SALAS[1]!.nombre);
    expect(localStorage.getItem('sgsm.salaRecordatorios')).toBe('2');

    await userEvent.selectOptions(await sala(), 'Todas');
    expect(localStorage.getItem('sgsm.salaRecordatorios')).toBeNull();
  });

  it('sin sala en la dirección, abre con la recordada', async () => {
    localStorage.setItem('sgsm.salaRecordatorios', '2');
    simularRecordatorios();
    const pedidos = contarPedidos();
    const { router } = renderizarApp('/recordatorios', ENFERMERO);

    await waitFor(async () => expect(await sala()).toHaveValue('2'));
    await waitFor(() => expect(pedidos.at(-1)?.get('salaId')).toBe('2'));
    // Queda en la dirección: volver desde Administrar trae la misma vista.
    expect(router.state.location.search).toBe('?salaId=2');
  });

  it('la sala de la dirección manda sobre la recordada', async () => {
    localStorage.setItem('sgsm.salaRecordatorios', '2');
    simularRecordatorios();
    const pedidos = contarPedidos();
    renderizarApp('/recordatorios?salaId=1', ENFERMERO);

    await waitFor(async () => expect(await sala()).toHaveValue('1'));
    await new Promise((r) => setTimeout(r, 50));
    expect(pedidos.every((p) => p.get('salaId') !== '2')).toBe(true);
  });

  it('una sala recordada que ya no existe se ignora', async () => {
    localStorage.setItem('sgsm.salaRecordatorios', '99');
    simularRecordatorios();
    const pedidos = contarPedidos();
    renderizarApp('/recordatorios', ENFERMERO);

    await screen.findByRole('option', { name: SALAS[0]!.nombre });
    expect(await sala()).toHaveValue('');
    await waitFor(() => expect(pedidos.at(-1)?.has('salaId')).toBe(false));
  });

  it('sin almacenamiento disponible, el filtro igual funciona', async () => {
    const leer = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Almacenamiento bloqueado');
    });
    const escribir = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Almacenamiento bloqueado');
    });
    simularRecordatorios();
    const pedidos = contarPedidos();
    renderizarApp('/recordatorios', ENFERMERO);
    await screen.findByRole('option', { name: SALAS[1]!.nombre });

    await userEvent.selectOptions(await sala(), SALAS[1]!.nombre);

    await waitFor(() => expect(pedidos.at(-1)?.get('salaId')).toBe('2'));
    leer.mockRestore();
    escribir.mockRestore();
  });
});

/** Screen Wake Lock falso: cuenta los pedidos y deja simular que el navegador lo soltó. */
function simularWakeLock() {
  const centinelas: { released: boolean; release: () => Promise<void> }[] = [];
  const request = vi.fn(async () => {
    const c = {
      released: false,
      release: vi.fn(async () => {
        c.released = true;
      }),
    };
    centinelas.push(c);
    return c;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, centinelas };
}

describe('mantener la pantalla encendida en el panel (ESC2)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
  });
  const interruptor = () => screen.findByRole('switch', { name: 'Mantener la pantalla encendida' });

  it('si el navegador no lo permite, el interruptor no aparece', async () => {
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);

    await screen.findByRole('switch', { name: 'Sonido de avisos' });
    expect(
      screen.queryByRole('switch', { name: 'Mantener la pantalla encendida' }),
    ).not.toBeInTheDocument();
  });

  it('apagado por defecto; al prenderlo pide que la pantalla no se apague y lo recuerda', async () => {
    const { request } = simularWakeLock();
    simularRecordatorios();
    renderizarApp('/recordatorios', MEDICO);

    const control = await interruptor();
    expect(control).not.toBeChecked();
    expect(request).not.toHaveBeenCalled();

    await userEvent.click(control);

    expect(control).toBeChecked();
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    expect(localStorage.getItem('sgsm.pantallaEncendida')).toBe('si');
  });

  it('con la preferencia guardada lo pide al abrir, lo vuelve a pedir al volver a la pantalla y lo suelta al salir', async () => {
    localStorage.setItem('sgsm.pantallaEncendida', 'si');
    const { request, centinelas } = simularWakeLock();
    simularRecordatorios();
    const { router } = renderizarApp('/recordatorios', ENFERMERO);

    expect(await interruptor()).toBeChecked();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    // La tablet se bloqueó: el navegador suelta el pedido; al volver, se pide de nuevo.
    centinelas[0]!.released = true;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    await act(() => router.navigate('/'));
    await waitFor(() => expect(centinelas[1]!.release).toHaveBeenCalled());
  });

  it('al apagarlo lo suelta y se olvida', async () => {
    localStorage.setItem('sgsm.pantallaEncendida', 'si');
    const { centinelas } = simularWakeLock();
    simularRecordatorios();
    renderizarApp('/recordatorios', ENFERMERO);
    const control = await interruptor();
    await waitFor(() => expect(centinelas).toHaveLength(1));

    await userEvent.click(control);

    expect(control).not.toBeChecked();
    await waitFor(() => expect(centinelas[0]!.release).toHaveBeenCalled());
    expect(localStorage.getItem('sgsm.pantallaEncendida')).toBeNull();
  });
});
