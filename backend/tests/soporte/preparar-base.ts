// Se ejecuta una vez antes de toda la suite: vacía la base de pruebas (datos que pudo dejar una
// corrida anterior interrumpida) y le aplica las migraciones pendientes.
import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

export default async function prepararBase() {
  const entorno = dotenv.config({
    path: path.resolve(__dirname, '../../.env.test'),
    processEnv: {},
    quiet: true,
  }).parsed;
  const url = entorno?.DATABASE_URL ?? '';
  const base = new URL(url).pathname.slice(1);
  // Resguardo: nunca tocar una base que no sea de pruebas.
  if (!base.endsWith('_test')) {
    throw new Error(`Las pruebas solo corren contra una base *_test (se recibió "${base}")`);
  }

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tablas.length > 0) {
      const lista = tablas.map((t) => `"${t.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE ${lista} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, ...entorno },
    stdio: 'pipe',
  });
}
