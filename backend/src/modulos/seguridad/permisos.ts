import type { RequestHandler } from 'express';
import { sinPermiso } from '../../comun/errores';
import { usuarioActual, type UsuarioSesion } from '../auth/sesion';
import type { CodigoPermiso } from './catalogo-permisos';

export const tienePermiso = (usuario: UsuarioSesion, codigo: CodigoPermiso | string) =>
  usuario.permisos.includes(codigo);

/**
 * Exige un permiso antes de ejecutar el endpoint (T106 · RN05 · RF15). Los permisos efectivos
 * son los del rol más los adicionales del usuario, leídos de la base en cada pedido. Va siempre
 * después de `autenticar`.
 */
export const requierePermiso =
  (codigo: CodigoPermiso): RequestHandler =>
  (req, _res, next) => {
    if (!tienePermiso(usuarioActual(req), codigo)) throw sinPermiso();
    next();
  };
