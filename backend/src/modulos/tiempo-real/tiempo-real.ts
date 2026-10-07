import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { parse } from 'cookie';
import { WebSocket, WebSocketServer } from 'ws';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma } from '../../db';
import { COOKIE_SESION } from '../auth/auth.middleware';
import { cargarUsuarioSesion, type UsuarioSesion } from '../auth/sesion';
import { verificarToken } from '../auth/tokens';
import { tienePermiso } from '../seguridad/permisos';
import { bus, type AvisoRecordatorios } from './bus';

/**
 * Tiempo real por WebSocket (T505 · D9, D10, D14, D16, D17). Contrato en docs/recordatorios.md.
 *
 * - Cuelga de /api/tiempo-real para que viaje la cookie de sesión (path /api).
 * - Origen: el mismo Host del pedido o uno de TIEMPO_REAL_ORIGENES; si no, HTTP 403 sin abrir.
 * - Sin sesión válida se abre y se cierra con 4001; sin `recordatorios.ver`, con 4003 (el
 *   navegador no ve el estado HTTP de un WebSocket rechazado, el código de cierre sí).
 * - Los mensajes solo avisan que algo cambió; la fuente de verdad es GET /api/recordatorios.
 * - Latido: ping a cada conexión; la que no contestó el anterior se termina. Además vuelve a
 *   validar el token de la conexión (que no se renueva, D14) y a leer al usuario de la base.
 */

export const RUTA_TIEMPO_REAL = '/api/tiempo-real';

/** Códigos de cierre propios (rango 4000–4999 de la aplicación). */
export const CIERRE = { SESION: 4001, PERMISO: 4003 } as const;

const PERMISO = 'recordatorios.ver';

export type MensajeTiempoReal = { tipo: 'conectado'; momento: string } | AvisoRecordatorios;

export interface TiempoReal {
  /** Una vuelta del latido: la corre el intervalo; las pruebas la llaman a mano. */
  latido(): Promise<void>;
  /** Conexiones abiertas y autorizadas. */
  conexiones(): number;
  /** Cierra todas las conexiones con 1001 y deja de atender. */
  cerrar(): Promise<void>;
}

interface Conexion {
  ws: WebSocket;
  usuarioId: number;
  /** Token de la cookie al conectar: la conexión no lo renueva (D14). */
  token: string;
  /** Contestó el último ping. */
  viva: boolean;
}

function origenPermitido(req: IncomingMessage): boolean {
  const origen = req.headers.origin;
  // Los navegadores siempre lo mandan; un cliente que no es navegador igual necesita la cookie.
  if (!origen) return true;
  if (config.tiempoReal.origenes.includes(origen)) return true;
  try {
    return new URL(origen).host === req.headers.host;
  } catch {
    return false;
  }
}

function rechazar(socket: Duplex, estado: number, texto: string) {
  socket.write(`HTTP/1.1 ${estado} ${texto}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

async function sesionDe(
  req: IncomingMessage,
): Promise<{ token: string; usuario: UsuarioSesion } | null> {
  const token = parse(req.headers.cookie ?? '')[COOKIE_SESION];
  if (!token) return null;
  let usuarioId: number;
  try {
    ({ usuarioId } = verificarToken(token));
  } catch {
    return null;
  }
  const usuario = await cargarUsuarioSesion(prisma, usuarioId);
  return usuario ? { token, usuario } : null;
}

const enviar = (ws: WebSocket, mensaje: MensajeTiempoReal) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(mensaje));
};

export function iniciarTiempoReal(
  servidor: Server,
  { latidoMs = config.tiempoReal.latidoSegundos * 1000 }: { latidoMs?: number } = {},
): TiempoReal {
  const wss = new WebSocketServer({ noServer: true });
  const conexiones = new Set<Conexion>();
  let cerrado = false;

  const cerrarConexion = (c: Conexion, codigo: number, motivo: string) => {
    conexiones.delete(c);
    c.ws.close(codigo, motivo);
  };

  async function abrir(ws: WebSocket, req: IncomingMessage) {
    ws.on('error', (e) => console.error('Error en una conexión de tiempo real', e));
    let sesion;
    try {
      sesion = await sesionDe(req);
    } catch (e) {
      console.error('No se pudo leer la sesión del tiempo real', e);
      ws.close(1011, 'Error interno');
      return;
    }
    if (!sesion) {
      ws.close(CIERRE.SESION, 'Sesión no iniciada o vencida');
      return;
    }
    if (!tienePermiso(sesion.usuario, PERMISO)) {
      ws.close(CIERRE.PERMISO, 'Sin permiso para ver recordatorios');
      return;
    }
    if (cerrado) {
      ws.close(1001, 'El servidor se está apagando');
      return;
    }
    const c: Conexion = { ws, usuarioId: sesion.usuario.id, token: sesion.token, viva: true };
    conexiones.add(c);
    ws.on('pong', () => (c.viva = true));
    ws.on('close', () => conexiones.delete(c));
    // Lo que mande el cliente se ignora: no hay mensajes del cliente en el contrato.
    enviar(ws, { tipo: 'conectado', momento: reloj.ahora().toISOString() });
  }

  const alPedirUpgrade = (req: IncomingMessage, socket: Duplex, cabeza: Buffer) => {
    const ruta = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (ruta !== RUTA_TIEMPO_REAL) return rechazar(socket, 404, 'Not Found');
    if (cerrado) return rechazar(socket, 503, 'Service Unavailable');
    if (!origenPermitido(req)) return rechazar(socket, 403, 'Forbidden');
    wss.handleUpgrade(req, socket, cabeza, (ws) => void abrir(ws, req));
  };
  servidor.on('upgrade', alPedirUpgrade);

  const baja = bus.suscribir((aviso) => {
    for (const c of conexiones) enviar(c.ws, aviso);
  });

  /** Primero la sesión y el permiso (cierre con un código que el cliente entiende), después si sigue viva. */
  async function revisar(c: Conexion) {
    try {
      verificarToken(c.token);
    } catch {
      return cerrarConexion(c, CIERRE.SESION, 'La sesión venció');
    }
    const usuario = await cargarUsuarioSesion(prisma, c.usuarioId);
    if (!usuario) return cerrarConexion(c, CIERRE.SESION, 'La sesión ya no es válida');
    if (!tienePermiso(usuario, PERMISO)) {
      return cerrarConexion(c, CIERRE.PERMISO, 'Sin permiso para ver recordatorios');
    }
    if (!c.viva) {
      conexiones.delete(c);
      c.ws.terminate();
      return;
    }
    c.viva = false;
    c.ws.ping();
  }

  const latido = async () => {
    await Promise.all([...conexiones].map(revisar));
  };
  const intervalo = setInterval(() => {
    latido().catch((e: unknown) => console.error('Falló el latido del tiempo real', e));
  }, latidoMs);
  intervalo.unref();

  return {
    latido,
    conexiones: () => conexiones.size,
    async cerrar() {
      if (cerrado) return;
      cerrado = true;
      clearInterval(intervalo);
      baja();
      servidor.off('upgrade', alPedirUpgrade);
      for (const c of conexiones) c.ws.close(1001, 'El servidor se está apagando');
      conexiones.clear();
      await new Promise<void>((ok) => wss.close(() => ok()));
    },
  };
}
