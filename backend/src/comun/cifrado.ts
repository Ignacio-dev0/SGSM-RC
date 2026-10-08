import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifrado de datos sensibles en reposo (T705 · RNF06 · docs/seguridad.md, D50–D53).
 *
 * Formato de cada blob:
 *
 *   [formato: 1 byte][huella de la clave: 4][IV: 12][etiqueta GCM: 16][cifrado]
 *
 * - Formato 1: AES-256-GCM. El 0 marca un dato todavía en claro (lo deja la migración que no
 *   tiene la clave); nunca se descifra como si fuera válido.
 * - La huella (4 bytes de SHA-256 de la clave) dice con qué clave se cifró: permite rotarla.
 * - El encabezado y el contexto (campo y dueño del dato) van como datos autenticados: un blob
 *   copiado a otro registro, o con el encabezado tocado, no pasa la verificación.
 */

export const FORMATO_PENDIENTE = 0;
export const FORMATO_AES_GCM = 1;

const LARGO_HUELLA = 4;
const LARGO_IV = 12;
const LARGO_ETIQUETA = 16;
const LARGO_ENCABEZADO = 1 + LARGO_HUELLA;
const INICIO_ETIQUETA = LARGO_ENCABEZADO + LARGO_IV;
const INICIO_CIFRADO = INICIO_ETIQUETA + LARGO_ETIQUETA;

export class ErrorDeCifrado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeCifrado';
  }
}

/** Clave actual (con la que se cifra) y anteriores (solo para leer durante una rotación). */
export interface Llavero {
  actual: Buffer;
  anteriores?: readonly Buffer[];
}

export const huellaDeClave = (clave: Buffer): Buffer =>
  createHash('sha256').update(clave).digest().subarray(0, LARGO_HUELLA);

const comoBuffer = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength);

const autenticados = (encabezado: Buffer, contexto: string) =>
  Buffer.concat([encabezado, Buffer.from(contexto, 'utf8')]);

export function cifrar(claro: Uint8Array, clave: Buffer, contexto: string): Buffer<ArrayBuffer> {
  const encabezado = Buffer.concat([Buffer.from([FORMATO_AES_GCM]), huellaDeClave(clave)]);
  const iv = randomBytes(LARGO_IV);
  const cifrador = createCipheriv('aes-256-gcm', clave, iv, { authTagLength: LARGO_ETIQUETA });
  cifrador.setAAD(autenticados(encabezado, contexto));
  const cuerpo = Buffer.concat([cifrador.update(claro), cifrador.final()]);
  return Buffer.concat([encabezado, iv, cifrador.getAuthTag(), cuerpo]);
}

export function descifrar(
  datos: Uint8Array,
  llavero: Llavero,
  contexto: string,
): Buffer<ArrayBuffer> {
  const blob = comoBuffer(datos);
  if (blob[0] === FORMATO_PENDIENTE) {
    throw new ErrorDeCifrado('El dato todavía no está cifrado (correr npm run biometria:cifrar)');
  }
  if (blob.length < INICIO_CIFRADO || blob[0] !== FORMATO_AES_GCM) {
    throw new ErrorDeCifrado('Formato de cifrado desconocido');
  }
  const huella = blob.subarray(1, LARGO_ENCABEZADO);
  const clave = [llavero.actual, ...(llavero.anteriores ?? [])].find((c) =>
    huellaDeClave(c).equals(huella),
  );
  if (!clave)
    throw new ErrorDeCifrado('El dato está cifrado con una clave que no está configurada');

  const descifrador = createDecipheriv(
    'aes-256-gcm',
    clave,
    blob.subarray(LARGO_ENCABEZADO, INICIO_ETIQUETA),
    { authTagLength: LARGO_ETIQUETA },
  );
  descifrador.setAAD(autenticados(blob.subarray(0, LARGO_ENCABEZADO), contexto));
  descifrador.setAuthTag(blob.subarray(INICIO_ETIQUETA, INICIO_CIFRADO));
  try {
    return Buffer.concat([descifrador.update(blob.subarray(INICIO_CIFRADO)), descifrador.final()]);
  } catch {
    throw new ErrorDeCifrado('El dato cifrado fue alterado o no corresponde a este registro');
  }
}

/** El blob no está cifrado con la clave actual: en claro (formato 0) o con una clave anterior. */
export function necesitaRecifrar(datos: Uint8Array, clave: Buffer): boolean {
  const blob = comoBuffer(datos);
  return (
    blob[0] !== FORMATO_AES_GCM || !blob.subarray(1, LARGO_ENCABEZADO).equals(huellaDeClave(clave))
  );
}

/** Clave de 32 bytes escrita en base64 (44 caracteres) o en hexadecimal (64). */
export function leerClave(valor: string, nombre: string): Buffer {
  const texto = valor.trim();
  let clave: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(texto)) clave = Buffer.from(texto, 'hex');
  else if (/^[A-Za-z0-9+/]{43}=?$/.test(texto)) clave = Buffer.from(texto, 'base64');
  if (clave?.length !== 32) {
    throw new Error(
      `${nombre} debe ser una clave de 32 bytes en base64 (44 caracteres) o en hexadecimal ` +
        `(64). Para generar una: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return clave;
}
