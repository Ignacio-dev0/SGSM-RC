import { z } from 'zod';
import { LARGO_PATRON, esPatronValido } from './comparacion';

/** Validación de los datos biométricos (T403) y de la validación facial (T404). */

export const MAXIMO_FOTO_BYTES = 512 * 1024;
export const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Máximo del cuerpo JSON de PUT /api/biometria/usuarios/:id (T705): la foto en base64 (4/3 de su
 * tamaño) más el patrón y un margen. El resto de la API acepta como mucho 100 KB.
 */
export const LIMITE_CUERPO_REGISTRO = Math.ceil((MAXIMO_FOTO_BYTES * 4) / 3) + 32 * 1024;

/** Primeros bytes de cada formato: la foto tiene que ser lo que dice ser (T705). */
const FIRMAS: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/webp': (b) =>
    b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

function coincideConSuTipo(foto: string) {
  const partes = DATA_URL.exec(foto);
  // Si no es una data URL, ya lo informa la expresión regular.
  if (!partes) return true;
  return FIRMAS[partes[1]!]?.(Buffer.from(partes[2]!, 'base64')) ?? false;
}

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
    )
    .refine(coincideConSuTipo, 'El contenido de la foto no coincide con su tipo de imagen'),
});

/** POST /api/biometria/validar: el patrón capturado y, opcional, qué operación se confirma. */
export const esquemaValidacion = z.object({
  patron: esquemaPatron,
  operacion: z.string().trim().max(80).optional(),
});
