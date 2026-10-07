import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { http, HttpResponse } from 'msw';
import { useState, type ReactNode } from 'react';
import type { UsuarioSesion } from '../api/tipos';
import { Contexto } from '../auth/useSesion';
import { ENFERMERO } from '../pruebas/datos';
import { servidor } from '../pruebas/servidor';
import { tema } from '../tema';
import { CapturaRostro } from './CapturaRostro';
import type { Deteccion, MotorFacial } from './motor';
import { ProveedorBiometria } from './ProveedorBiometria';
import { descriptorSimulado } from './simulado';
import { useValidacionFacial } from './useValidacionFacial';

const PATRON = Array.from({ length: 128 }, () => 0.1);

/** Motor falso: devuelve las detecciones indicadas, una por llamada (la última se repite). */
function motorFalso(detecciones: Deteccion[]): MotorFacial {
  let i = 0;
  return {
    cargar: vi.fn(async () => {}),
    detectar: vi.fn(async () => detecciones[Math.min(i++, detecciones.length - 1)]!),
  };
}

function conProveedores(
  ui: ReactNode,
  opciones: { usuario?: UsuarioSesion; motor?: MotorFacial } = {},
) {
  const usuario = opciones.usuario ?? ENFERMERO;
  return render(
    <ThemeProvider theme={tema}>
      <Contexto.Provider
        value={{
          usuario,
          aviso: null,
          iniciarSesion: async () => {},
          cerrarSesion: async () => {},
          refrescarSesion: async () => {},
          tienePermiso: (p) => usuario.permisos.includes(p),
        }}
      >
        <ProveedorBiometria {...(opciones.motor ? { motor: opciones.motor } : {})}>
          {ui}
        </ProveedorBiometria>
      </Contexto.Provider>
    </ThemeProvider>,
  );
}

describe('captura del rostro (T402 · CU07)', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,AAAA',
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('pide un solo rostro y entrega el patrón de 128 valores con la foto', async () => {
    const alCapturar = vi.fn();
    const motor = motorFalso([
      { rostros: 2, descriptor: null },
      { rostros: 1, descriptor: PATRON },
      { rostros: 1, descriptor: PATRON },
    ]);
    conProveedores(<CapturaRostro persona="enfermero" alCapturar={alCapturar} />, { motor });

    expect(await screen.findByText(/más de un rostro/)).toBeInTheDocument();
    await waitFor(() => expect(alCapturar).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(alCapturar).toHaveBeenCalledWith({
      descriptor: PATRON,
      foto: 'data:image/jpeg;base64,AAAA',
    });
    expect(motor.cargar).toHaveBeenCalled();
  });

  it('explica qué hacer si no se puede usar la cámara, sin jerga técnica, y deja reintentar', async () => {
    const pedirCamara = vi.mocked(navigator.mediaDevices.getUserMedia);
    pedirCamara.mockRejectedValue(new Error('NotAllowedError'));
    conProveedores(<CapturaRostro persona="enfermero" alCapturar={vi.fn()} />, {
      motor: motorFalso([{ rostros: 0, descriptor: null }]),
    });

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/No se pudo encender la cámara/);
    expect(alerta).toHaveTextContent(/permiso/);
    expect(alerta).not.toHaveTextContent(/HTTPS|localhost|VITE_/);
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(pedirCamara).toHaveBeenCalledTimes(2));
  });

  it('en modo de demostración simula el rostro de la persona sin usar la cámara', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
    const alCapturar = vi.fn();
    conProveedores(<CapturaRostro persona="enfermero" alCapturar={alCapturar} />);

    expect(screen.getByText(/Modo de demostración/)).toBeInTheDocument();
    expect(screen.queryByText(/VITE_/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Simular el rostro de enfermero/ }));

    expect(alCapturar).toHaveBeenCalledWith(
      expect.objectContaining({ descriptor: descriptorSimulado('enfermero') }),
    );
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});

describe('validación facial reutilizable (T405 · CU10)', () => {
  beforeEach(() => vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado'));
  afterEach(() => vi.unstubAllEnvs());

  /** Componente de prueba: una operación que pide la validación facial. */
  function Operacion({
    operacion = 'Administración de medicamento',
    detalle,
  }: {
    operacion?: string;
    detalle?: ReactNode;
  }) {
    const { pedirValidacion, modalValidacion } = useValidacionFacial();
    const [resultado, setResultado] = useState('sin pedir');
    return (
      <>
        <button
          onClick={async () =>
            setResultado((await pedirValidacion(operacion, detalle)) ?? 'cancelada')
          }
        >
          Confirmar
        </button>
        <p>Resultado: {resultado}</p>
        {modalValidacion}
      </>
    );
  }

  const responder = (...respuestas: object[]) => {
    let i = 0;
    const enviados: unknown[] = [];
    servidor.use(
      http.post('*/api/biometria/validar', async ({ request }) => {
        enviados.push(await request.json());
        return HttpResponse.json({ data: respuestas[Math.min(i++, respuestas.length - 1)] });
      }),
    );
    return enviados;
  };

  it('devuelve el comprobante cuando el rostro coincide', async () => {
    const enviados = responder({ valido: true, validacionToken: 'tok-123', similitud: 0.9 });
    conProveedores(<Operacion />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByRole('dialog', { name: /Confirmar con su rostro/ })).toHaveTextContent(
      'Administración de medicamento',
    );
    await userEvent.click(screen.getByRole('button', { name: /Simular el rostro de enfermero/ }));

    expect(await screen.findByText('Resultado: tok-123')).toBeInTheDocument();
    expect(enviados[0]).toEqual({
      patron: descriptorSimulado('enfermero'),
      operacion: 'Administración de medicamento',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('muestra lo que se confirma y recorta la descripción al largo que admite el servidor', async () => {
    const enviados = responder({ valido: true, validacionToken: 'tok-1', similitud: 0.9 });
    const larga =
      'Administración de Amoxicilina + ácido clavulánico a Fernández de la Fuente, María Guadalupe';
    conProveedores(<Operacion operacion={larga} detalle={<p>Cama A-01</p>} />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.getByRole('dialog', { name: /Confirmar con su rostro/ })).toHaveTextContent(
      'Cama A-01',
    );
    await userEvent.click(screen.getByRole('button', { name: /Simular el rostro de enfermero/ }));

    expect(await screen.findByText('Resultado: tok-1')).toBeInTheDocument();
    const enviada = (enviados[0] as { operacion: string }).operacion;
    expect(enviada.length).toBeLessThanOrEqual(80);
    expect(enviada).toMatch(/^Administración de Amoxicilina/);
  });

  it('si no coincide informa los intentos restantes y deja reintentar', async () => {
    responder(
      { valido: false, intentosRestantes: 2, cancelada: false },
      { valido: true, validacionToken: 'tok-2', similitud: 0.8 },
    );
    conProveedores(<Operacion />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: /Simular otro rostro/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Le quedan 2 intentos/);

    // UX-04: no se reintenta sola; la captura vuelve recién al tocar "Intentar de nuevo".
    expect(
      screen.queryByRole('button', { name: /Simular el rostro de enfermero/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));

    await userEvent.click(screen.getByRole('button', { name: /Simular el rostro de enfermero/ }));
    expect(await screen.findByText('Resultado: tok-2')).toBeInTheDocument();
  });

  it('con un error de red avisa que revise la conexión, sin descontar un intento', async () => {
    let pedidos = 0;
    servidor.use(
      http.post('*/api/biometria/validar', () => {
        pedidos += 1;
        return pedidos === 1
          ? HttpResponse.error()
          : HttpResponse.json({
              data: { valido: true, validacionToken: 'tok-red', similitud: 0.9 },
            });
      }),
    );
    conProveedores(<Operacion />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: /Simular el rostro de enfermero/ }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('No se pudo verificar: revise la conexión');
    expect(alerta).not.toHaveTextContent(/Le quedan|intento/);
    expect(
      screen.queryByRole('button', { name: /Simular el rostro de enfermero/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    await userEvent.click(screen.getByRole('button', { name: /Simular el rostro de enfermero/ }));
    expect(await screen.findByText('Resultado: tok-red')).toBeInTheDocument();
    expect(pedidos).toBe(2);
  });

  it('con un error del servidor (5xx) tampoco reintenta solo ni cuenta un intento', async () => {
    servidor.use(
      http.post('*/api/biometria/validar', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 503 },
        ),
      ),
    );
    conProveedores(<Operacion />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: /Simular el rostro de enfermero/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo verificar: revise la conexión',
    );
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Simular el rostro de enfermero/ }),
    ).not.toBeInTheDocument();
  });

  it('mientras espera el reintento se puede cancelar la operación', async () => {
    responder({ valido: false, intentosRestantes: 2, cancelada: false });
    conProveedores(<Operacion />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: /Simular otro rostro/ }));
    await screen.findByRole('button', { name: 'Intentar de nuevo' });

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Resultado: cancelada')).toBeInTheDocument();
  });

  it('en modo demostración lo repite dentro del diálogo, porque tapa la franja de la pantalla (F27)', async () => {
    conProveedores(<Operacion />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const dialogo = screen.getByRole('dialog', { name: /Confirmar con su rostro/ });
    expect(within(dialogo).getByRole('note')).toHaveTextContent(
      'Modo demostración: el rostro se simula.',
    );
    // Un solo aviso: la captura no repite el suyo dentro del diálogo.
    expect(within(dialogo).getAllByText(/Modo (de )?demostración/)).toHaveLength(1);
  });

  it('con la cámara real no muestra el aviso de demostración en el diálogo', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'camara');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    });
    conProveedores(<Operacion />, { motor: motorFalso([{ rostros: 0, descriptor: null }]) });

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      within(screen.getByRole('dialog', { name: /Confirmar con su rostro/ })).queryByRole('note'),
    ).not.toBeInTheDocument();
  });

  it('tras tres fallos cancela la operación y avisa que se notificó al administrador', async () => {
    responder({ valido: false, intentosRestantes: 0, cancelada: true });
    conProveedores(<Operacion />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('button', { name: /Simular otro rostro/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Se canceló la operación/);
    expect(screen.getByRole('alert')).toHaveTextContent(/administrador/);
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(await screen.findByText('Resultado: cancelada')).toBeInTheDocument();
  });

  it('si el usuario no tiene el rostro registrado no abre la cámara y lo explica', async () => {
    conProveedores(<Operacion />, { usuario: { ...ENFERMERO, tieneBiometria: false } });

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/no tiene el rostro registrado/i);
    expect(screen.queryByRole('button', { name: /Simular/ })).not.toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    });
    expect(await screen.findByText('Resultado: cancelada')).toBeInTheDocument();
  });
});

describe('validación facial con cámara: sin reintento automático (UX-04)', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,AAAA',
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function Operacion() {
    const { pedirValidacion, modalValidacion } = useValidacionFacial();
    const [resultado, setResultado] = useState('sin pedir');
    return (
      <>
        <button
          onClick={async () =>
            setResultado((await pedirValidacion('Administración de medicamento')) ?? 'cancelada')
          }
        >
          Confirmar
        </button>
        <p>Resultado: {resultado}</p>
        {modalValidacion}
      </>
    );
  }

  it('tras un rostro no reconocido espera el botón: no vuelve a capturar ni gasta intentos', async () => {
    let pedidos = 0;
    servidor.use(
      http.post('*/api/biometria/validar', () => {
        pedidos += 1;
        return HttpResponse.json({
          data:
            pedidos === 1
              ? { valido: false, intentosRestantes: 2, cancelada: false }
              : { valido: true, validacionToken: 'tok-camara', similitud: 0.9 },
        });
      }),
    );
    const motor = motorFalso([{ rostros: 1, descriptor: PATRON }]);
    conProveedores(<Operacion />, { motor });

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      /Le quedan 2 intentos/,
    );
    expect(pedidos).toBe(1);
    const detecciones = vi.mocked(motor.detectar).mock.calls.length;

    // Mucho más que el intervalo de captura (250 ms): la cámara sigue apagada y no hay otro pedido.
    await new Promise((r) => setTimeout(r, 1200));
    expect(pedidos).toBe(1);
    expect(vi.mocked(motor.detectar).mock.calls.length).toBe(detecciones);

    await userEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }));
    expect(await screen.findByText('Resultado: tok-camara', {}, { timeout: 3000 })).toBeVisible();
    expect(pedidos).toBe(2);
  });
});
