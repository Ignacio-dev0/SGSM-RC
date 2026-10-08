// Copia los modelos de reconocimiento facial de @vladmandic/face-api a public/models (T402).
// Se ejecuta solo antes de `dev` y `build`; la carpeta destino no se versiona.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const origen = join(dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');

// Detector liviano (pensado para tablets), 68 puntos de referencia y el modelo que genera el
// patrón de 128 valores.
const MODELOS = ['tiny_face_detector_model', 'face_landmark_68_model', 'face_recognition_model'];

mkdirSync(destino, { recursive: true });
for (const modelo of MODELOS) {
  for (const archivo of [`${modelo}.bin`, `${modelo}-weights_manifest.json`]) {
    if (!existsSync(join(destino, archivo)))
      copyFileSync(join(origen, archivo), join(destino, archivo));
  }
}
console.info(`Modelos de reconocimiento facial listos en ${destino}`);
