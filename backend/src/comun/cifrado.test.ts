import { randomBytes } from 'node:crypto';
import {
  ErrorDeCifrado,
  FORMATO_AES_GCM,
  cifrar,
  descifrar,
  huellaDeClave,
  leerClave,
  necesitaRecifrar,
} from './cifrado';

const CLAVE = randomBytes(32);
const OTRA = randomBytes(32);
const CONTEXTO = 'datos_biometricos.patron:7';
const CLARO = Buffer.from('dato sensible que nunca tiene que verse en la base');

describe('cifrado en reposo con AES-256-GCM (T705 · RNF06)', () => {
  it('cifra y descifra con la misma clave y el mismo contexto', () => {
    const blob = cifrar(CLARO, CLAVE, CONTEXTO);
    expect(descifrar(blob, { actual: CLAVE }, CONTEXTO)).toEqual(CLARO);
  });

  it('el blob no contiene el dato y lleva formato, huella de la clave, IV y etiqueta', () => {
    const blob = cifrar(CLARO, CLAVE, CONTEXTO);

    expect(blob.includes(CLARO)).toBe(false);
    expect(blob.includes(CLARO.subarray(0, 8))).toBe(false);
    expect(blob[0]).toBe(FORMATO_AES_GCM);
    expect(blob.subarray(1, 5)).toEqual(huellaDeClave(CLAVE));
    // 1 de formato + 4 de huella + 12 de IV + 16 de etiqueta + el cifrado (mismo largo).
    expect(blob.length).toBe(33 + CLARO.length);
  });

  it('usa un IV aleatorio: dos cifrados del mismo dato son distintos', () => {
    const a = cifrar(CLARO, CLAVE, CONTEXTO);
    const b = cifrar(CLARO, CLAVE, CONTEXTO);
    expect(a.equals(b)).toBe(false);
    expect(a.subarray(5, 17).equals(b.subarray(5, 17))).toBe(false);
  });

  it('con otra clave no se puede descifrar', () => {
    const blob = cifrar(CLARO, CLAVE, CONTEXTO);
    expect(() => descifrar(blob, { actual: OTRA }, CONTEXTO)).toThrow(ErrorDeCifrado);
  });

  it('aunque se falsifique la huella, otra clave no pasa la autenticación de GCM', () => {
    const blob = cifrar(CLARO, CLAVE, CONTEXTO);
    huellaDeClave(OTRA).copy(blob, 1);
    expect(() => descifrar(blob, { actual: OTRA }, CONTEXTO)).toThrow(/alterado/);
  });

  it.each([
    ['el cifrado', 40],
    ['la etiqueta', 20],
    ['el IV', 8],
  ])('un blob con %s alterado falla (GCM)', (_parte, posicion) => {
    const blob = cifrar(CLARO, CLAVE, CONTEXTO);
    blob[posicion]! ^= 0x01;
    expect(() => descifrar(blob, { actual: CLAVE }, CONTEXTO)).toThrow(ErrorDeCifrado);
  });

  it('el blob queda atado a su contexto: no sirve para otro usuario ni otro campo', () => {
    const blob = cifrar(CLARO, CLAVE, CONTEXTO);
    expect(() => descifrar(blob, { actual: CLAVE }, 'datos_biometricos.patron:8')).toThrow(
      ErrorDeCifrado,
    );
    expect(() => descifrar(blob, { actual: CLAVE }, 'datos_biometricos.foto:7')).toThrow(
      ErrorDeCifrado,
    );
  });

  it('rechaza un formato desconocido o un dato todavía en claro (formato 0)', () => {
    const pendiente = Buffer.concat([Buffer.from([0]), CLARO]);
    expect(() => descifrar(pendiente, { actual: CLAVE }, CONTEXTO)).toThrow(/no está cifrado/);
    expect(() => descifrar(Buffer.from([9, 1, 2]), { actual: CLAVE }, CONTEXTO)).toThrow(
      ErrorDeCifrado,
    );
  });

  describe('rotación de la clave', () => {
    it('descifra con una clave anterior del llavero, que reconoce por la huella', () => {
      const viejo = cifrar(CLARO, OTRA, CONTEXTO);
      expect(descifrar(viejo, { actual: CLAVE, anteriores: [OTRA] }, CONTEXTO)).toEqual(CLARO);
    });

    it('sabe qué blobs hay que volver a cifrar con la clave actual', () => {
      expect(necesitaRecifrar(cifrar(CLARO, CLAVE, CONTEXTO), CLAVE)).toBe(false);
      expect(necesitaRecifrar(cifrar(CLARO, OTRA, CONTEXTO), CLAVE)).toBe(true);
      expect(necesitaRecifrar(Buffer.concat([Buffer.from([0]), CLARO]), CLAVE)).toBe(true);
    });
  });

  describe('lectura de la clave de una variable de entorno', () => {
    it('acepta 32 bytes en base64 o en hexadecimal', () => {
      expect(leerClave(CLAVE.toString('base64'), 'CLAVE')).toEqual(CLAVE);
      expect(leerClave(CLAVE.toString('hex'), 'CLAVE')).toEqual(CLAVE);
      expect(leerClave(CLAVE.toString('hex').toUpperCase(), 'CLAVE')).toEqual(CLAVE);
    });

    it.each([
      ['corta', randomBytes(16).toString('base64')],
      ['larga', randomBytes(48).toString('hex')],
      ['que no es base64 ni hex', 'una clave cualquiera de texto'],
      ['vacía', ''],
    ])('rechaza una clave %s con un mensaje que dice cómo generarla', (_caso, valor) => {
      expect(() => leerClave(valor, 'BIOMETRIA_CLAVE')).toThrow(
        /BIOMETRIA_CLAVE.*32 bytes[\s\S]*randomBytes\(32\)/,
      );
    });
  });
});
