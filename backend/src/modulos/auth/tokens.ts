import jwt from 'jsonwebtoken';
import { noAutenticado } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';

export interface DatosToken {
  usuarioId: number;
  /** Hora en que se inició la sesión con usuario y contraseña. */
  inicio: Date;
}

const segundos = (fecha: Date) => Math.floor(fecha.getTime() / 1000);

/**
 * Emite el token de sesión (T105). Vence a los `inactividadMinutos` de emitido; el middleware
 * de autenticación lo vuelve a emitir en cada pedido, así que la sesión solo se cierra si pasa
 * ese tiempo SIN actividad (sesión deslizante). El tiempo lo da `reloj`, no el de la librería.
 */
export function emitirToken({ usuarioId, inicio }: DatosToken): string {
  const ahora = segundos(reloj.ahora());
  return jwt.sign(
    {
      sub: String(usuarioId),
      inicio: inicio.toISOString(),
      iat: ahora,
      exp: ahora + config.sesion.inactividadMinutos * 60,
    },
    config.sesion.secreto,
    { algorithm: 'HS256' },
  );
}

export function verificarToken(token: string): DatosToken {
  let datos: jwt.JwtPayload;
  try {
    datos = jwt.verify(token, config.sesion.secreto, {
      algorithms: ['HS256'],
      clockTimestamp: segundos(reloj.ahora()),
    }) as jwt.JwtPayload;
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      throw noAutenticado('La sesión se cerró por inactividad. Vuelva a ingresar.');
    }
    throw noAutenticado();
  }

  const usuarioId = Number(datos.sub);
  const inicio = new Date(String(datos.inicio));
  if (!Number.isInteger(usuarioId) || Number.isNaN(inicio.getTime())) throw noAutenticado();

  const limite = inicio.getTime() + config.sesion.maximaHoras * 3_600_000;
  if (reloj.ahora().getTime() > limite) {
    throw noAutenticado('La sesión alcanzó su duración máxima. Vuelva a ingresar.');
  }
  return { usuarioId, inicio };
}
