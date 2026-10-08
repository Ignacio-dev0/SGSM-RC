// Ayudantes de biometría para las pruebas: rostro registrado y comprobante de validación.
import type { Test } from 'supertest';
import { prisma } from '../../src/db';
import { cifrarDatoBiometrico } from '../../src/modulos/biometria/cifrado-biometrico';

export const ROSTRO = Array.from({ length: 128 }, () => 0.1);

type Agente = { post: (url: string) => Test };

export async function registrarRostro(usuarioId: number) {
  await prisma.datoBiometrico.create({
    data: {
      usuarioId,
      ...cifrarDatoBiometrico(usuarioId, ROSTRO, Buffer.from('foto')),
      fotoTipo: 'image/jpeg',
      registradoPorId: usuarioId,
    },
  });
}

/** Valida el rostro del usuario del agente y devuelve el comprobante. */
export async function comprobanteDe(agente: Agente): Promise<string> {
  const res = await agente.post('/api/biometria/validar').send({ patron: ROSTRO });
  if (!res.body.data?.valido) throw new Error(`No se pudo validar: ${JSON.stringify(res.body)}`);
  return res.body.data.validacionToken;
}
