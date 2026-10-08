import { Router } from 'express';
import { reloj } from '../../comun/reloj';
import { validar } from '../../comun/validacion';
import { config } from '../../config';
import { prisma } from '../../db';
import {
  COOKIE_SESION,
  autenticar,
  borrarCookieSesion,
  fijarCookieSesion,
} from './auth.middleware';
import { esquemaLogin } from './auth.esquemas';
import { cerrarSesion, iniciarSesion } from './auth.servicio';
import { contarSiFallo, frenarLoginPorIp } from './limite-ip';
import { cargarUsuarioSesion, usuarioActual } from './sesion';
import { emitirToken, verificarToken } from './tokens';

const conDatosDeSesion = <T extends object>(usuario: T) => ({
  ...usuario,
  inactividadMinutos: config.sesion.inactividadMinutos,
});

export const rutasAuth = Router();

/** POST /api/auth/login — CU06. Con límite de fallidos por IP además del bloqueo por cuenta (T705). */
rutasAuth.post('/login', frenarLoginPorIp, async (req, res) => {
  const { nombreUsuario, contrasena } = validar(esquemaLogin, req.body);
  const usuarioId = await iniciarSesion(nombreUsuario, contrasena).catch((e: unknown) => {
    contarSiFallo(req, e);
    throw e;
  });
  const usuario = await cargarUsuarioSesion(prisma, usuarioId);
  fijarCookieSesion(res, emitirToken({ usuarioId, inicio: reloj.ahora() }));
  res.json({ data: conDatosDeSesion(usuario!) });
});

/** POST /api/auth/logout — funciona aunque la sesión ya haya vencido. */
rutasAuth.post('/logout', async (req, res) => {
  const token: unknown = req.cookies?.[COOKIE_SESION];
  if (typeof token === 'string' && token !== '') {
    try {
      await cerrarSesion(verificarToken(token).usuarioId);
    } catch {
      // Token vencido o inválido: no hay sesión que registrar, solo se borra la cookie.
    }
  }
  borrarCookieSesion(res);
  res.json({ data: { cerrada: true } });
});

/** GET /api/auth/sesion — usuario de la sesión activa (el frontend lo pide al cargar). */
rutasAuth.get('/sesion', autenticar, (req, res) => {
  res.json({ data: conDatosDeSesion(usuarioActual(req)) });
});
