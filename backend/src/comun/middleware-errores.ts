import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ErrorApi, noEncontrado } from './errores';
import { detallesDeZod } from './validacion';

/** Rutas sin handler: 404 con el formato estándar. */
export const rutaNoEncontrada: RequestHandler = (_req, _res, next) => {
  next(noEncontrado());
};

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
  console.error(err);
  res
    .status(500)
    .json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } });
};
