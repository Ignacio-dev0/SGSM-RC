import type { Request } from 'express';
import { noAutenticado } from '../../comun/errores';
import type { ClienteDb } from '../../db';

/** Usuario autenticado tal como lo ven los endpoints y el frontend. */
export interface UsuarioSesion {
  id: number;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  rol: { codigo: string; nombre: string };
  /** Permisos efectivos: los del rol más los adicionales del usuario (RN05). */
  permisos: string[];
  /** Si el usuario tiene registrado su patrón facial (necesario para suministrar). */
  tieneBiometria: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioSesion;
    inicioSesion?: Date;
  }
}

/** Devuelve el usuario autenticado del pedido; falla si la ruta no pasó por `autenticar`. */
export function usuarioActual(req: Request): UsuarioSesion {
  if (!req.usuario) throw noAutenticado();
  return req.usuario;
}

/**
 * Lee el usuario fresco de la base en cada pedido: una baja o un cambio de rol o de permisos
 * tiene efecto inmediato, sin esperar a que venza la sesión. Devuelve null si no está activo.
 */
export async function cargarUsuarioSesion(
  db: ClienteDb,
  usuarioId: number,
): Promise<UsuarioSesion | null> {
  const u = await db.usuario.findUnique({
    where: { id: usuarioId },
    include: {
      rol: { include: { permisos: { include: { permiso: true } } } },
      permisosAdicionales: { include: { permiso: true } },
      datoBiometrico: { select: { id: true } },
    },
  });
  if (!u || !u.activo) return null;

  const permisos = new Set([
    ...u.rol.permisos.map((rp) => rp.permiso.codigo),
    ...u.permisosAdicionales.map((up) => up.permiso.codigo),
  ]);
  return {
    id: u.id,
    nombreUsuario: u.nombreUsuario,
    nombre: u.nombre,
    apellido: u.apellido,
    rol: { codigo: u.rol.codigo, nombre: u.rol.nombre },
    permisos: [...permisos].sort(),
    tieneBiometria: u.datoBiometrico !== null,
  };
}
