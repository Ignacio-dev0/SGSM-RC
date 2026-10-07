import { z } from 'zod';
import { LARGO_PATRON, esPatronValido } from './comparacion';

/** Validación de los datos biométricos (T403) y de la validación facial (T404). */

const MAXIMO_FOTO_BYTES = 512 * 1024;
export const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export const esquemaPatron = z.custom<number[]>(esPatronValido, {
  message: `El patrón facial debe tener ${LARGO_PATRON} valores numéricos`,
});

export const esquemaRegistroBiometrico = z.object({
  patron: esquemaPatron,
  foto: z
    .string({ error: 'Falta la foto de referencia' })
    .regex(DATA_URL, 'La foto debe ser una imagen JPEG, PNG o WebP')
    .refine(
      (f) => Buffer.byteLength(f.split(',')[1] ?? '', 'base64') <= MAXIMO_FOTO_BYTES,
      'La foto no puede superar los 512 KB',
    ),
});

/** POST /api/biometria/validar: el patrón capturado y, opcional, qué operación se confirma. */
export const esquemaValidacion = z.object({
  patron: esquemaPatron,
  operacion: z.string().trim().max(80).optional(),
});
