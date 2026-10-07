import type { ZodError, ZodType } from 'zod';
import { errorValidacion } from './errores';

export interface DetalleValidacion {
  campo: string;
  mensaje: string;
}

export const detallesDeZod = (err: ZodError): DetalleValidacion[] =>
  err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));

/** Valida `datos` contra el esquema y devuelve el resultado tipado, o lanza un 400. */
export function validar<T>(esquema: ZodType<T>, datos: unknown): T {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    throw errorValidacion('Los datos enviados no son válidos', detallesDeZod(r.error));
  }
  return r.data;
}
