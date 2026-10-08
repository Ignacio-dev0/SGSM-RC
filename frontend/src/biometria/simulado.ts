/**
 * Rostros simulados para el modo de demostración (VITE_BIOMETRIA_MODO=simulado), cuando no hay
 * cámara: el patrón de una persona se deriva de su nombre de usuario de forma determinística.
 * El backend usa el mismo algoritmo para sembrar los rostros de los usuarios de prueba
 * (backend/src/semillas/biometria-simulada.ts). NUNCA se usa en modo cámara.
 */

/** Hash FNV-1a de 32 bits. */
function hash(texto: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Generador pseudoaleatorio mulberry32 (reproducible a partir de una semilla). */
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

/** 128 valores en [-0,2; 0,2], como los de face-api. */
export function descriptorSimulado(clave: string): number[] {
  const azar = generador(hash(clave));
  return Array.from({ length: 128 }, () => (azar() - 0.5) * 0.4);
}

export function descriptorDesconocido(): number[] {
  return descriptorSimulado(`desconocido-${Date.now()}-${Math.random()}`);
}

/** Foto de referencia de relleno (PNG de 1 × 1) para el modo de demostración. */
export const FOTO_SIMULADA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
