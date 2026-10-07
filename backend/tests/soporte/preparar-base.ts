// Se ejecuta una vez antes de toda la suite: aplica las migraciones a la base de pruebas.
import { execSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

export default function prepararBase() {
  const entorno = dotenv.config({
    path: path.resolve(__dirname, '../../.env.test'),
    processEnv: {},
    quiet: true,
  }).parsed;
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, ...entorno },
    stdio: 'pipe',
  });
}
