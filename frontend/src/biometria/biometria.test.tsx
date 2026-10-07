import { act, render, screen, waitFor } from '@testing-library/react';
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

  it('explica qué hacer si no se puede usar la cámara', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('NotAllowedError'));
    conProveedores(<CapturaRostro persona="enfermero" alCapturar={vi.fn()} />, {
      motor: motorFalso([{ rostros: 0, descriptor: null }]),
    });
    expect(await screen.findByText(/No se pudo usar la cámara/)).toBeInTheDocument();
  });

  it('en modo de demostración simula el rostro de la persona sin usar la cámara', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
    const alCapturar = vi.fn();
    conProveedores(<CapturaRostro persona="enfermero" alCapturar={alCapturar} />);

    expect(screen.getByText(/Modo de demostración/)).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole('button', { name: /Simular el rostro de enfermero/ }));
    expect(await screen.findByText('Resultado: tok-2')).toBeInTheDocument();
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
