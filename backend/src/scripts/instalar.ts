// Instalador para la primera puesta en marcha (T803 · docs/despliegue.md, paso 7): datos base,
// primer administrador y, si se indican, salas, catálogo y personal desde CSV. Idempotente.
// Uso: npm run instalar -w backend -- [opciones] (en Docker: node dist/scripts/instalar.js).
import { prisma } from '../db';
import { ejecutarInstalador } from './instalacion/instalador';
import { preguntadorDeTerminal } from './instalacion/terminal';

// Solo se pregunta si hay alguien frente a una terminal (no en un script ni con la entrada redirigida).
const preguntador = process.stdin.isTTY && process.stdout.isTTY ? preguntadorDeTerminal() : null;

ejecutarInstalador(process.argv.slice(2), {
  env: process.env,
  preguntador,
  consola: { info: (linea) => console.info(linea), error: (linea) => console.error(linea) },
})
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((e: unknown) => {
    // Error inesperado (por ejemplo, sin base): la transacción no llegó a confirmarse.
    console.error('No se pudo completar la instalación; no se cargó nada.', e);
    process.exitCode = 1;
  })
  .finally(() => {
    preguntador?.cerrar();
    return prisma.$disconnect();
  });
