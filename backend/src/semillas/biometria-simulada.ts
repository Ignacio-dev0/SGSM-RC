import type { PrismaClient } from '@prisma/client';
import { cifrarDatoBiometrico } from '../modulos/biometria/cifrado-biometrico';
import { USUARIOS_DE_PRUEBA } from './usuarios-prueba';

/**
 * Rostros simulados para el modo de demostración (SOLO desarrollo). Mismo algoritmo que
 * frontend/src/biometria/simulado.ts: así, con VITE_BIOMETRIA_MODO=simulado, el botón
 * "Simular mi rostro" de la tablet coincide con el patrón sembrado acá. En modo cámara estos
 * patrones no coinciden con ninguna cara real: hay que registrar el rostro desde Biometría.
 */

function hash(texto: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function generador(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function descriptorSimulado(clave: string): number[] {
  const azar = generador(hash(clave));
  return Array.from({ length: 128 }, () => (azar() - 0.5) * 0.4);
}

// PNG de 1 × 1 como foto de referencia de relleno.
const FOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export async function sembrarRostrosSimulados(prisma: PrismaClient) {
  for (const u of USUARIOS_DE_PRUEBA) {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { nombreUsuario: u.nombreUsuario },
    });
    const datos = {
      ...cifrarDatoBiometrico(usuario.id, descriptorSimulado(u.nombreUsuario), FOTO),
      fotoTipo: 'image/png',
      registradoPorId: usuario.id,
    };
    await prisma.datoBiometrico.upsert({
      where: { usuarioId: usuario.id },
      create: { usuarioId: usuario.id, ...datos },
      update: {},
    });
  }
}
