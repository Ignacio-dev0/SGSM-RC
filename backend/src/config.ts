import dotenv from 'dotenv';

dotenv.config({ quiet: true });

function entero(nombre: string, porDefecto: number): number {
  const v = process.env[nombre];
  if (v === undefined || v === '') return porDefecto;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`La variable ${nombre} debe ser numérica`);
  return n;
}

export const config = {
  entorno: process.env.NODE_ENV ?? 'development',
  puerto: entero('PORT', 3000),
  /** Costo de bcrypt: 10 en desarrollo/producción; las pruebas usan 4 para ir rápido. */
  bcryptCosto: entero('BCRYPT_COSTO', 10),
};
