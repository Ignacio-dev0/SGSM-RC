import type { CookieOptions, RequestHandler, Response } from 'express';
import { noAutenticado } from '../../comun/errores';
import { config } from '../../config';
import { prisma } from '../../db';
import { cargarUsuarioSesion } from './sesion';
import { emitirToken, verificarToken } from './tokens';

export const COOKIE_SESION = 'sgsm_sesion';

const opcionesCookie = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.sesion.cookieSegura,
  path: '/api',
});

export function fijarCookieSesion(res: Response, token: string) {
  res.cookie(COOKIE_SESION, token, {
    ...opcionesCookie(),
    maxAge: config.sesion.inactividadMinutos * 60_000,
  });
}

export function borrarCookieSesion(res: Response) {
  res.clearCookie(COOKIE_SESION, opcionesCookie());
}

/**
 * Exige una sesión válida (T105). Valida el token de la cookie, vuelve a leer el usuario de la
 * base y renueva el token: la sesión se cierra solo tras el período de inactividad.
 */
export const autenticar: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[COOKIE_SESION];
  if (typeof token !== 'string' || token === '') throw noAutenticado();

  let datos;
  try {
    datos = verificarToken(token);
  } catch (e) {
    borrarCookieSesion(res);
    throw e;
  }

  const usuario = await cargarUsuarioSesion(prisma, datos.usuarioId);
  if (!usuario) {
    borrarCookieSesion(res);
    throw noAutenticado('La sesión ya no es válida. Vuelva a ingresar.');
  }

  req.usuario = usuario;
  req.inicioSesion = datos.inicio;
  fijarCookieSesion(res, emitirToken(datos));
  next();
};
