import type { Prisma } from '@prisma/client';

/**
 * Carga masiva sin los disparadores de las claves foráneas (T702): cada fila insertada las
 * comprobaba una por una y bloqueaba la fila padre, y eso era el 90 % del tiempo de carga. Se
 * apagan solo dentro de la transacción del generador (`SET LOCAL`) y, al final, se comprueban
 * todas juntas con una consulta por clave: si algo quedó huérfano, la transacción se revierte.
 */

type Tx = Prisma.TransactionClient;

/** Devuelve si pudo apagarlas (hace falta superusuario, como el `sgsm` del contenedor). */
export async function apagarClavesForaneas(tx: Tx): Promise<boolean> {
  const [rol] = await tx.$queryRaw<{ superusuario: boolean }[]>`
    SELECT rolsuper AS superusuario FROM pg_roles WHERE rolname = current_user`;
  if (!rol?.superusuario) {
    console.info('  Sin superusuario: la carga comprueba cada clave foránea (más lenta)');
    return false;
  }
  await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
  return true;
}

/** Comprueba cada clave foránea de una columna y vuelve a encender los disparadores. */
export async function verificarClavesForaneas(tx: Tx) {
  await tx.$executeRawUnsafe('SET LOCAL session_replication_role = DEFAULT');
  const claves = await tx.$queryRaw<
    { nombre: string; hija: string; columna: string; padre: string; referida: string }[]
  >`
    SELECT c.conname AS nombre, c.conrelid::regclass::text AS hija, a.attname AS columna,
           c.confrelid::regclass::text AS padre, r.attname AS referida
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_attribute r ON r.attrelid = c.confrelid AND r.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND cardinality(c.conkey) = 1
      AND c.connamespace = 'public'::regnamespace`;
  for (const k of claves) {
    const [fila] = await tx.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM ${k.hija} h
       WHERE h."${k.columna}" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${k.padre} p WHERE p."${k.referida}" = h."${k.columna}")`,
    );
    if (Number(fila?.n ?? 0) > 0) {
      throw new Error(`${fila?.n} filas de ${k.hija} rompen la clave foránea ${k.nombre}`);
    }
  }
  console.info(`  Claves foráneas comprobadas: ${claves.length}`);
}
