// Se importa PRIMERO en los scripts de volumen: fija la base antes de que se cree el cliente de
// Prisma (db.ts) y se niega a seguir si no es una base *_volumen o si es producción.
import { URL_VOLUMEN_POR_DEFECTO, baseDeVolumen } from './base';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Los scripts de volumen no se ejecutan en producción');
}
// Sin DATABASE_URL en el entorno, la de volumen (el .env del backend apunta a `sgsm`).
process.env.DATABASE_URL ??= URL_VOLUMEN_POR_DEFECTO;
export const BASE_VOLUMEN = baseDeVolumen(process.env.DATABASE_URL);
