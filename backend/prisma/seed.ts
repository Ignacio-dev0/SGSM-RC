// Semilla de la base de desarrollo: `npm run db:sembrar -w backend` (T103).
import { PrismaClient } from '@prisma/client';
import { sembrarRostrosSimulados } from '../src/semillas/biometria-simulada';
import { sembrarCatalogoDeDesarrollo } from '../src/semillas/catalogo-base';
import { sembrarUsuariosDePrueba } from '../src/semillas/usuarios-prueba';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La semilla de desarrollo no se ejecuta en producción');
  }
  await sembrarCatalogoDeDesarrollo(prisma);
  await sembrarUsuariosDePrueba(prisma);
  await sembrarRostrosSimulados(prisma);
  console.info(
    'Semilla cargada: roles, permisos, camas, catálogo, tipos de estudio y usuarios de prueba',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
