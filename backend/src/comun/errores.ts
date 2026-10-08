/**
 * Error de negocio con el código y el estado HTTP que define la convención de la API
 * (docs/api.md). Todo error esperado se lanza con esta clase; el middleware de errores lo
 * traduce a `{ error: { codigo, mensaje, detalles? } }`.
 */
export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export const errorValidacion = (mensaje: string, detalles?: unknown) =>
  new ErrorApi(400, 'VALIDACION', mensaje, detalles);

export const noAutenticado = (mensaje = 'Sesión no iniciada o vencida') =>
  new ErrorApi(401, 'NO_AUTENTICADO', mensaje);

export const sinPermiso = (mensaje = 'No tiene permiso para realizar esta acción') =>
  new ErrorApi(403, 'SIN_PERMISO', mensaje);

export const noEncontrado = (mensaje = 'Recurso no encontrado') =>
  new ErrorApi(404, 'NO_ENCONTRADO', mensaje);

export const conflicto = (codigo: string, mensaje: string, detalles?: unknown) =>
  new ErrorApi(409, codigo, mensaje, detalles);

export const reglaNegocio = (codigo: string, mensaje: string, detalles?: unknown) =>
  new ErrorApi(422, codigo, mensaje, detalles);
