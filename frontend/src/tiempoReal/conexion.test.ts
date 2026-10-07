import {
  conectarTiempoReal,
  esperaDeReconexion,
  urlTiempoReal,
  type EstadoConexion,
  type MensajeTiempoReal,
  type SocketTiempoReal,
} from './conexion';

/** WebSocket falso: las pruebas deciden qué manda y cómo se cierra el "servidor". */
class SocketFalso implements SocketTiempoReal {
  onmessage: ((evento: MessageEvent) => void) | null = null;
  onclose: ((evento: CloseEvent) => void) | null = null;
  cerradoCon: number | undefined;
  constructor(public readonly url: string) {}
  close(codigo?: number) {
    this.cerradoCon = codigo;
  }
  recibir(mensaje: unknown) {
    const data = typeof mensaje === 'string' ? mensaje : JSON.stringify(mensaje);
    this.onmessage?.(new MessageEvent('message', { data }));
  }
  cerrarDesdeElServidor(codigo: number) {
    this.onclose?.(new CloseEvent('close', { code: codigo }));
  }
}

interface Espera {
  fn: () => void;
  ms: number;
  cancelada: boolean;
}

const MOMENTO = '2026-10-07T12:00:00.000Z';
const CONECTADO = { tipo: 'conectado', momento: MOMENTO };

function preparar() {
  const sockets: SocketFalso[] = [];
  const esperas: Espera[] = [];
  const mensajes: MensajeTiempoReal[] = [];
  const estados: EstadoConexion[] = [];
  const alTerminarSesion = vi.fn();
  const alPerderPermiso = vi.fn();
  const conexion = conectarTiempoReal({
    url: 'ws://tablet.local/api/tiempo-real',
    fabrica: (url) => {
      const s = new SocketFalso(url);
      sockets.push(s);
      return s;
    },
    programar: (fn, ms) => {
      const e = { fn, ms, cancelada: false };
      esperas.push(e);
      return () => {
        e.cancelada = true;
      };
    },
    alMensaje: (m) => mensajes.push(m),
    alCambiarEstado: (e) => estados.push(e),
    alTerminarSesion,
    alPerderPermiso,
  });
  /** El último socket abierto. */
  const actual = () => sockets.at(-1)!;
  /** Corre la espera pendiente (la reconexión programada). */
  const pasarLaEspera = () => {
    const pendiente = esperas.filter((e) => !e.cancelada).at(-1);
    if (!pendiente) throw new Error('No hay ninguna espera pendiente');
    pendiente.cancelada = true;
    pendiente.fn();
  };
  return {
    conexion,
    sockets,
    esperas,
    mensajes,
    estados,
    alTerminarSesion,
    alPerderPermiso,
    actual,
    pasarLaEspera,
  };
}

describe('URL del tiempo real', () => {
  it('usa ws:// con HTTP y wss:// con HTTPS, en el mismo origen que la interfaz', () => {
    expect(urlTiempoReal({ protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/api/tiempo-real',
    );
    expect(urlTiempoReal({ protocol: 'https:', host: 'sgsm.hospital.ar' })).toBe(
      'wss://sgsm.hospital.ar/api/tiempo-real',
    );
  });
});

describe('espera creciente para reconectar (1 s a 30 s)', () => {
  it('se duplica en cada intento y no pasa de 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(esperaDeReconexion)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });
});

describe('conexión de tiempo real (T505)', () => {
  it('abre el socket en la URL pedida y empieza conectando', () => {
    const p = preparar();
    expect(p.sockets).toHaveLength(1);
    expect(p.actual().url).toBe('ws://tablet.local/api/tiempo-real');
    expect(p.conexion.estado()).toBe('conectando');
  });

  it('con "conectado" queda conectada y avisa el mensaje (para resincronizar)', () => {
    const p = preparar();
    p.actual().recibir(CONECTADO);
    expect(p.conexion.estado()).toBe('conectado');
    expect(p.estados).toEqual(['conectado']);
    expect(p.mensajes).toEqual([CONECTADO]);
  });

  it('avisa los cambios de recordatorios con sus cantidades y la hora del servidor', () => {
    const p = preparar();
    p.actual().recibir(CONECTADO);
    p.actual().recibir({ tipo: 'recordatorios', nuevos: 2, vencidos: 1, momento: MOMENTO });
    expect(p.mensajes.at(-1)).toEqual({
      tipo: 'recordatorios',
      nuevos: 2,
      vencidos: 1,
      momento: MOMENTO,
    });
  });

  it('ignora lo que no entiende (texto que no es JSON, tipos desconocidos, datos incompletos)', () => {
    const p = preparar();
    p.actual().recibir('no es json');
    p.actual().recibir({ tipo: 'otro', momento: MOMENTO });
    p.actual().recibir({ tipo: 'recordatorios', nuevos: 'dos', vencidos: 0, momento: MOMENTO });
    p.actual().recibir({ tipo: 'conectado' });
    expect(p.mensajes).toEqual([]);
    expect(p.conexion.estado()).toBe('conectando');
  });

  describe.each([
    [1006, 'corte de red o latido sin respuesta'],
    [1001, 'el servidor se reinicia'],
    [1011, 'cualquier otro cierre inesperado'],
  ])('cierre %i (%s)', (codigo) => {
    it('queda sin conexión y reconecta con espera creciente de 1 s a 30 s', () => {
      const p = preparar();
      p.actual().recibir(CONECTADO);

      p.actual().cerrarDesdeElServidor(codigo);
      expect(p.conexion.estado()).toBe('sin-conexion');
      expect(p.sockets).toHaveLength(1);

      const esperasVistas: number[] = [];
      for (let i = 0; i < 7; i++) {
        esperasVistas.push(p.esperas.at(-1)!.ms);
        p.pasarLaEspera();
        // Cada intento falla igual, sin llegar a "conectado".
        p.actual().cerrarDesdeElServidor(1006);
      }
      expect(esperasVistas).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
      expect(p.sockets).toHaveLength(8);
      expect(p.conexion.estado()).toBe('sin-conexion');
      expect(p.alTerminarSesion).not.toHaveBeenCalled();
    });

    it('al volver a recibir "conectado" queda conectada y la espera vuelve a empezar en 1 s', () => {
      const p = preparar();
      p.actual().recibir(CONECTADO);
      p.actual().cerrarDesdeElServidor(codigo);
      p.pasarLaEspera();
      p.actual().cerrarDesdeElServidor(1006);
      expect(p.esperas.at(-1)!.ms).toBe(2_000);
      p.pasarLaEspera();

      p.actual().recibir(CONECTADO);
      expect(p.conexion.estado()).toBe('conectado');
      expect(p.estados).toEqual(['conectado', 'sin-conexion', 'conectado']);

      p.actual().cerrarDesdeElServidor(codigo);
      expect(p.esperas.at(-1)!.ms).toBe(1_000);
    });
  });

  it('1000 (cierre normal): no reconecta ni avisa nada', () => {
    const p = preparar();
    p.actual().recibir(CONECTADO);
    p.actual().cerrarDesdeElServidor(1000);
    expect(p.sockets).toHaveLength(1);
    expect(p.esperas).toHaveLength(0);
    expect(p.alTerminarSesion).not.toHaveBeenCalled();
    expect(p.alPerderPermiso).not.toHaveBeenCalled();
  });

  describe('4001 (sesión de la conexión vencida)', () => {
    it('si la conexión estaba abierta, reconecta enseguida, una sola vez, sin esperar', () => {
      const p = preparar();
      p.actual().recibir(CONECTADO);

      p.actual().cerrarDesdeElServidor(4001);

      expect(p.sockets).toHaveLength(2);
      expect(p.esperas).toHaveLength(0);
      expect(p.alTerminarSesion).not.toHaveBeenCalled();
    });

    it('si la nueva conexión recibe "conectado", sigue normal (y otro 4001 más adelante vuelve a reconectar)', () => {
      const p = preparar();
      p.actual().recibir(CONECTADO);
      p.actual().cerrarDesdeElServidor(4001);

      p.actual().recibir(CONECTADO);
      expect(p.conexion.estado()).toBe('conectado');
      expect(p.mensajes).toEqual([CONECTADO, CONECTADO]);

      p.actual().cerrarDesdeElServidor(4001);
      expect(p.sockets).toHaveLength(3);
      expect(p.alTerminarSesion).not.toHaveBeenCalled();
    });

    it('si la nueva conexión también cierra con 4001 sin "conectado", la sesión terminó: avisa y no sigue', () => {
      const p = preparar();
      p.actual().recibir(CONECTADO);
      p.actual().cerrarDesdeElServidor(4001);

      p.actual().cerrarDesdeElServidor(4001);

      expect(p.alTerminarSesion).toHaveBeenCalledTimes(1);
      expect(p.sockets).toHaveLength(2);
      expect(p.esperas).toHaveLength(0);
      expect(p.conexion.estado()).toBe('sin-conexion');
    });

    it('sin sesión al conectar: también prueba una vez más antes de dar la sesión por terminada', () => {
      const p = preparar();
      p.actual().cerrarDesdeElServidor(4001);
      expect(p.sockets).toHaveLength(2);
      expect(p.alTerminarSesion).not.toHaveBeenCalled();

      p.actual().cerrarDesdeElServidor(4001);
      expect(p.alTerminarSesion).toHaveBeenCalledTimes(1);
      expect(p.sockets).toHaveLength(2);
    });
  });

  it('4003 (sin recordatorios.ver): no reconecta y pide refrescar la sesión', () => {
    const p = preparar();
    p.actual().recibir(CONECTADO);

    p.actual().cerrarDesdeElServidor(4003);

    expect(p.alPerderPermiso).toHaveBeenCalledTimes(1);
    expect(p.sockets).toHaveLength(1);
    expect(p.esperas).toHaveLength(0);
    expect(p.conexion.estado()).toBe('sin-conexion');
  });

  it('cerrar() cierra con 1000, cancela la reconexión pendiente y no vuelve a abrir', () => {
    const p = preparar();
    p.actual().recibir(CONECTADO);
    p.actual().cerrarDesdeElServidor(1006);
    p.pasarLaEspera();
    const abierto = p.actual();
    abierto.cerrarDesdeElServidor(1006);
    expect(p.esperas.filter((e) => !e.cancelada)).toHaveLength(1);

    p.conexion.cerrar();

    expect(p.esperas.filter((e) => !e.cancelada)).toHaveLength(0);
    expect(p.sockets).toHaveLength(2);
  });

  it('cerrar() con el socket abierto lo cierra con 1000 y no avisa nada después', () => {
    const p = preparar();
    const socket = p.actual();
    socket.recibir(CONECTADO);

    p.conexion.cerrar();
    socket.recibir({ tipo: 'recordatorios', nuevos: 1, vencidos: 0, momento: MOMENTO });
    socket.cerrarDesdeElServidor(1006);

    expect(socket.cerradoCon).toBe(1000);
    expect(p.mensajes).toEqual([CONECTADO]);
    expect(p.esperas).toHaveLength(0);
  });

  it('reconectarYa(): si está esperando para reconectar (volvió la red o la pantalla), lo intenta ahora', () => {
    const p = preparar();
    p.actual().recibir(CONECTADO);
    p.actual().cerrarDesdeElServidor(1006);
    expect(p.sockets).toHaveLength(1);

    p.conexion.reconectarYa();

    expect(p.sockets).toHaveLength(2);
    expect(p.esperas.every((e) => e.cancelada)).toBe(true);
  });

  it('reconectarYa() con la conexión abierta no hace nada', () => {
    const p = preparar();
    p.actual().recibir(CONECTADO);
    p.conexion.reconectarYa();
    expect(p.sockets).toHaveLength(1);
  });

  it('si el navegador no puede crear el socket, lo trata como un corte y reintenta', () => {
    const esperas: number[] = [];
    let intentos = 0;
    const conexion = conectarTiempoReal({
      url: 'ws://tablet.local/api/tiempo-real',
      fabrica: () => {
        intentos++;
        throw new Error('SecurityError');
      },
      programar: (_fn, ms) => {
        esperas.push(ms);
        return () => {};
      },
      alMensaje: () => {},
    });
    expect(intentos).toBe(1);
    expect(esperas).toEqual([1_000]);
    expect(conexion.estado()).toBe('sin-conexion');
  });
});
