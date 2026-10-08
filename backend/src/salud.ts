import type { RequestHandler } from 'express';
import { prisma } from './db';

/**
 * GET /api/salud (D100): la usan el healthcheck de compose (wget, 5 s) y scripts/estado.sh.
 * La API solo está sana si la base contesta un SELECT 1 dentro del tiempo máximo.
 */
export const salud = {
  /** Cuánto se espera a la base antes de responder 503 (menos que el timeout del healthcheck). */
  tiempoMaximoMs: 2000,
};

/** true si la base responde `SELECT 1` antes del tiempo máximo. */
export async function baseResponde(tiempoMaximoMs = salud.tiempoMaximoMs): Promise<boolean> {
  let espera: NodeJS.Timeout | undefined;
  const vencida = new Promise<string>((ok) => {
    espera = setTimeout(() => ok(`no contestó en ${tiempoMaximoMs} ms`), tiempoMaximoMs);
  });
  try {
    const motivo = await Promise.race([prisma.$queryRaw`SELECT 1`.then(() => null), vencida]);
    if (motivo === null) return true;
    console.error('Salud: la base no responde', motivo);
  } catch (e) {
    // Solo el mensaje: el detalle queda en el registro, nunca en la respuesta (D61).
    console.error('Salud: la base no responde', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(espera);
  }
  return false;
}

export const rutaSalud: RequestHandler = async (_req, res) => {
  if (await baseResponde()) {
    res.json({ data: { estado: 'ok' } });
  } else {
    res.status(503).json({ data: { estado: 'sin-base' } });
  }
};
