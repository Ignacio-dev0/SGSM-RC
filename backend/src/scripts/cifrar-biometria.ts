// Cifra los datos biométricos pendientes (T705 · docs/seguridad.md): los que dejó en claro la
// migración biometria_cifrada y, en una rotación, los cifrados con BIOMETRIA_CLAVE_ANTERIOR.
// Idempotente. Uso: npm run biometria:cifrar -w backend (en Docker: node dist/scripts/cifrar-biometria.js).
import { prisma } from '../db';
import { cifrarPendientes } from '../modulos/biometria/cifrado-biometrico';

cifrarPendientes()
  .then(({ revisados, cifrados, ilegibles }) => {
    console.info(`Registros por cifrar: ${revisados}. Cifrados con la clave actual: ${cifrados}.`);
    if (ilegibles.length > 0) {
      console.error(
        `No se pudieron descifrar ${ilegibles.length} (usuarios ${ilegibles.join(', ')}): ` +
          'revisar BIOMETRIA_CLAVE y BIOMETRIA_CLAVE_ANTERIOR, o registrar esos rostros de nuevo.',
      );
      process.exitCode = 1;
    }
  })
  .catch((e: unknown) => {
    console.error('No se pudo cifrar los datos biométricos', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
