/**
 * Conexión con el tiempo real de recordatorios (T505). Contrato en docs/recordatorios.md: los
 * mensajes solo avisan que algo cambió (la lista se vuelve a pedir por HTTP) y el código de cierre
 * dice qué hacer. No depende de React: la fábrica del socket y el reloj se inyectan, así las
 * pruebas la manejan sin red.
 */

export type EstadoConexion = 'conectando' | 'conectado' | 'sin-conexion';

export type MensajeTiempoReal =
  | { tipo: 'conectado'; momento: string }
  | { tipo: 'recordatorios'; nuevos: number; vencidos: number; momento: string };

/** Lo que se usa de un WebSocket: el del navegador lo cumple; las pruebas pasan uno falso. */
export interface SocketTiempoReal {
  onmessage: ((evento: MessageEvent) => void) | null;
  onclose: ((evento: CloseEvent) => void) | null;
  close(codigo?: number): void;
}

export type FabricaSocket = (url: string) => SocketTiempoReal;

/** Programa `fn` dentro de `ms` y devuelve cómo cancelarla. */
export type Programar = (fn: () => void, ms: number) => () => void;

/** Códigos de cierre del contrato. */
export const CIERRE = { NORMAL: 1000, SESION: 4001, PERMISO: 4003 } as const;

const ESPERA_INICIAL_MS = 1_000;
const ESPERA_MAXIMA_MS = 30_000;

/** Espera antes del intento `intento` (desde 0): 1 s, 2 s, 4 s… hasta 30 s. */
export const esperaDeReconexion = (intento: number) =>
  Math.min(ESPERA_INICIAL_MS * 2 ** intento, ESPERA_MAXIMA_MS);

/** Mismo origen que la interfaz, para que viaje la cookie de sesión (path /api). */
export const urlTiempoReal = (ubicacion: Pick<Location, 'protocol' | 'host'> = window.location) =>
  `${ubicacion.protocol === 'https:' ? 'wss' : 'ws'}://${ubicacion.host}/api/tiempo-real`;

/** El mensaje, si es uno de los del contrato; si no, null (se ignora). */
export function leerMensaje(datos: unknown): MensajeTiempoReal | null {
  let m: unknown;
  try {
    m = JSON.parse(String(datos));
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const { tipo, momento, nuevos, vencidos } = m as Record<string, unknown>;
  if (typeof momento !== 'string') return null;
  if (tipo === 'conectado') return { tipo, momento };
  if (tipo === 'recordatorios' && typeof nuevos === 'number' && typeof vencidos === 'number') {
    return { tipo, nuevos, vencidos, momento };
  }
  return null;
}

export interface OpcionesConexion {
  /** Por defecto, `urlTiempoReal()`. */
  url?: string;
  /** Por defecto, el WebSocket del navegador. */
  fabrica?: FabricaSocket;
  /** Por defecto, setTimeout. */
  programar?: Programar;
  alMensaje: (mensaje: MensajeTiempoReal) => void;
  alCambiarEstado?: (estado: EstadoConexion) => void;
  /** La conexión volvió a cerrar con 4001 sin llegar a abrirse: la sesión terminó (como un 401). */
  alTerminarSesion?: () => void;
  /** 4003: el usuario no tiene (o perdió) `recordatorios.ver`; hay que volver a pedir la sesión. */
  alPerderPermiso?: () => void;
}

export interface ConexionTiempoReal {
  estado(): EstadoConexion;
  /** Si está esperando para reconectar, lo intenta ahora (volvió la red o la pantalla). */
  reconectarYa(): void;
  /** Cierre normal (1000): no reconecta ni avisa nada más. */
  cerrar(): void;
}

const fabricaDelNavegador: FabricaSocket = (url) => new WebSocket(url);

const programarConTimeout: Programar = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * Abre la conexión y la mantiene:
 * - `conectado`: queda conectada; la espera de reconexión vuelve a 1 s.
 * - 1001, 1006 y cualquier cierre inesperado: sin conexión, reconecta con espera creciente.
 * - 4001: reconecta enseguida una sola vez (la cookie pudo renovarse con otros pedidos); si esa
 *   conexión vuelve a cerrar con 4001 sin recibir `conectado`, la sesión terminó.
 * - 4003: no reconecta y pide refrescar la sesión. 1000: nada.
 */
export function conectarTiempoReal(opciones: OpcionesConexion): ConexionTiempoReal {
  const fabrica = opciones.fabrica ?? fabricaDelNavegador;
  const programar = opciones.programar ?? programarConTimeout;
  const url = opciones.url ?? urlTiempoReal();

  let estado: EstadoConexion = 'conectando';
  let socket: SocketTiempoReal | null = null;
  let intento = 0;
  let cancelarEspera: (() => void) | null = null;
  /** Ya se usó la reconexión única por 4001 y todavía no llegó un `conectado`. */
  let reintentoPorSesion = false;
  let cerrada = false;

  const fijarEstado = (nuevo: EstadoConexion) => {
    if (nuevo === estado) return;
    estado = nuevo;
    opciones.alCambiarEstado?.(nuevo);
  };

  const esperarYReconectar = () => {
    fijarEstado('sin-conexion');
    cancelarEspera = programar(abrir, esperaDeReconexion(intento++));
  };

  const alCerrar = (codigo: number) => {
    if (cerrada) return;
    switch (codigo) {
      case CIERRE.NORMAL:
        fijarEstado('sin-conexion');
        return;
      case CIERRE.PERMISO:
        fijarEstado('sin-conexion');
        opciones.alPerderPermiso?.();
        return;
      case CIERRE.SESION:
        if (!reintentoPorSesion) {
          reintentoPorSesion = true;
          fijarEstado('conectando');
          abrir();
          return;
        }
        fijarEstado('sin-conexion');
        opciones.alTerminarSesion?.();
        return;
      default:
        esperarYReconectar();
    }
  };

  function abrir() {
    cancelarEspera = null;
    let s: SocketTiempoReal;
    try {
      s = fabrica(url);
    } catch {
      esperarYReconectar();
      return;
    }
    socket = s;
    s.onmessage = (evento) => {
      const mensaje = leerMensaje(evento.data);
      if (!mensaje || socket !== s) return;
      if (mensaje.tipo === 'conectado') {
        intento = 0;
        reintentoPorSesion = false;
        fijarEstado('conectado');
      }
      opciones.alMensaje(mensaje);
    };
    s.onclose = (evento) => {
      if (socket !== s) return;
      socket = null;
      alCerrar(evento.code);
    };
  }

  abrir();

  return {
    estado: () => estado,
    reconectarYa() {
      if (cerrada || !cancelarEspera) return;
      cancelarEspera();
      abrir();
    },
    cerrar() {
      cerrada = true;
      cancelarEspera?.();
      cancelarEspera = null;
      const s = socket;
      socket = null;
      if (s) {
        s.onmessage = null;
        s.onclose = null;
        s.close(CIERRE.NORMAL);
      }
    },
  };
}
