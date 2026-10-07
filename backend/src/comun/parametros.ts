import { z } from 'zod';
import { validar } from './validacion';

const esquemaId = z.coerce.number().int().positive();

/** Lee un parámetro de ruta numérico (`:id`); responde 400 si no es un entero positivo. */
export function idDeRuta(valor: unknown): number {
  return validar(esquemaId, valor);
}
