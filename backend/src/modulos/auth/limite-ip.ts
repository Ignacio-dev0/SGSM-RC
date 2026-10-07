import type { Request, RequestHandler } from 'express';
import { ErrorApi } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';

/**
 * Límite de intentos fallidos de inicio de sesión por IP (T705 · docs/seguridad.md, D60). Se
 * suma al bloqueo por usuario (T112): frena a quien prueba muchos usuarios con pocas contraseñas
 * cada uno. Cuenta solo los fallidos, en una ventana deslizante, en la memoria del proceso.
 */
export function crearLimitePorIp({
  maxFallidos,
  ventanaMs,
  ahora = () => reloj.ahora().getTime(),
}: {
  /** Fallidos en la ventana a partir de los que se frena la IP; 0 lo desactiva. */
  maxFallidos: number;
  ventanaMs: number;
  ahora?: () => number;
}) {
  /** IP → horas de sus últimos fallidos (como mucho `maxFallidos`, del más viejo al más nuevo). */
  const fallidos = new Map<string, number[]>();
  let ultimaPurga = -Infinity;

  function recientes(ip: string, t: number) {
    const lista = (fallidos.get(ip) ?? []).filter((f) => f > t - ventanaMs);
    if (lista.length > 0) fallidos.set(ip, lista);
    else fallidos.delete(ip);
    return lista;
  }

  // Una vez por ventana se olvidan las IP sin fallidos recientes.
  function purgar(t: number) {
    if (t - ultimaPurga < ventanaMs) return;
    ultimaPurga = t;
    for (const ip of [...fallidos.keys()]) recientes(ip, t);
  }

  return {
    /** Segundos que tiene que esperar la IP para volver a intentar (0: puede intentar). */
    esperaSegundos(ip: string): number {
      const t = ahora();
      purgar(t);
      if (maxFallidos <= 0) return 0;
      const lista = recientes(ip, t);
      if (lista.length < maxFallidos) return 0;
      // Se libera un intento cuando vence el más viejo de los que cuentan.
      const libera = lista[lista.length - maxFallidos]! + ventanaMs;
      return Math.max(1, Math.ceil((libera - t) / 1000));
    },
    registrarFallo(ip: string) {
      const t = ahora();
      purgar(t);
      fallidos.set(ip, [...recientes(ip, t), t].slice(-Math.max(1, maxFallidos)));
    },
    reiniciar() {
      fallidos.clear();
      ultimaPurga = -Infinity;
    },
    ipsRegistradas: () => fallidos.size,
  };
}

/** El del servidor: LOGIN_IP_MAX_FALLIDOS en LOGIN_IP_VENTANA_MIN minutos. */
export const limiteLogin = crearLimitePorIp({
  maxFallidos: config.login.ip.maxFallidos,
  ventanaMs: config.login.ip.ventanaMinutos * 60_000,
});

/** IP del cliente; detrás del proxy la toma de X-Forwarded-For (CONFIAR_PROXY). */
const ipDe = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'desconocida';

/** Antes de evaluar el login: 429 DEMASIADOS_INTENTOS con Retry-After si la IP está frenada. */
export const frenarLoginPorIp: RequestHandler = (req, res, next) => {
  const espera = limiteLogin.esperaSegundos(ipDe(req));
  if (espera > 0) {
    const minutos = Math.ceil(espera / 60);
    res.set('Retry-After', String(espera));
    throw new ErrorApi(
      429,
      'DEMASIADOS_INTENTOS',
      `Demasiados intentos fallidos desde este dispositivo. Espere ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} y vuelva a intentar.`,
      { reintentarEnSegundos: espera },
    );
  }
  next();
};

/** Suma un fallido a la IP si el login falló por credenciales o por cuenta bloqueada. */
export function contarSiFallo(req: Request, error: unknown) {
  if (error instanceof ErrorApi && (error.estado === 401 || error.estado === 423)) {
    limiteLogin.registrarFallo(ipDe(req));
  }
}
