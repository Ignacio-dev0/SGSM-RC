import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ErrorApi, noEncontrado } from './errores';
import { detallesDeZod } from './validacion';

/** Rutas sin handler: 404 con el formato estándar. */
export const rutaNoEncontrada: RequestHandler = (_req, _res, next) => {
  next(noEncontrado());
};

/** Error del lector del cuerpo (body-parser): demasiado grande, juego de caracteres, etc. */
function esErrorDelCuerpo(err: unknown): err is { status: number } {
  if (typeof err !== 'object' || err === null) return false;
  const { status, type } = err as { status?: unknown; type?: unknown };
  return typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500;
}

/** Traduce cualquier error a la respuesta `{ error: { codigo, mensaje, detalles? } }`. */
export const manejarErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ErrorApi) {
    res.status(err.estado).json({
      error: {
        codigo: err.codigo,
        mensaje: err.message,
        ...(err.detalles !== undefined ? { detalles: err.detalles } : {}),
      },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        codigo: 'VALIDACION',
        mensaje: 'Los datos enviados no son válidos',
        detalles: detallesDeZod(err),
      },
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res
      .status(400)
      .json({ error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo no es JSON válido' } });
    return;
  }
  if (esErrorDelCuerpo(err)) {
    const grande = err.status === 413;
    res.status(err.status).json({
      error: grande
        ? { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El pedido es demasiado grande' }
        : { codigo: 'PEDIDO_INVALIDO', mensaje: 'No se pudo leer el pedido' },
    });
    return;
  }
  // Nunca el mensaje ni la traza al cliente, en ningún entorno: solo al registro del servidor.
  console.error(err);
  res
    .status(500)
    .json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } });
};
