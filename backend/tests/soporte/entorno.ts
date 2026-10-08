// Se ejecuta antes de cada archivo de prueba: fuerza las variables de .env.test.
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: true, quiet: true });
