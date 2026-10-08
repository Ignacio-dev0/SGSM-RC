import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from '../db';
import { limpiarBase } from '../../tests/soporte/base';

const CLAVE = 'Directora2026';
const BACKEND = path.resolve(__dirname, '../..');

/** El comando tal cual (tsx en desarrollo; en Docker es el mismo código compilado), sin terminal. */
function instalar(args: string[], variables: Record<string, string> = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([nombre]) => !nombre.startsWith('INSTALAR_')),
  );
  return spawnSync(
    process.execPath,
    [require.resolve('tsx/cli'), 'src/scripts/instalar.ts', ...args],
    { cwd: BACKEND, env: { ...env, ...variables }, encoding: 'utf8', timeout: 60_000 },
  );
}

/** npm run instalar -w backend (T803): código de salida y lo que muestra, en un proceso aparte. */
describe('comando instalar (T803)', () => {
  beforeEach(() => limpiarBase());
  afterAll(() => prisma.$disconnect());

  it('sin administrador, sin variables y sin terminal: termina con 1 y dice qué falta', () => {
    const r = instalar([]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('faltan INSTALAR_ADMIN_USUARIO');
  });

  it('con las variables crea el primer administrador, termina con 0 y no muestra la contraseña', async () => {
    const r = instalar([], {
      INSTALAR_ADMIN_USUARIO: 'lmendez',
      INSTALAR_ADMIN_NOMBRE: 'Laura',
      INSTALAR_ADMIN_APELLIDO: 'Méndez',
      INSTALAR_ADMIN_DNI: '20111111',
      INSTALAR_ADMIN_CLAVE: CLAVE,
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Primer administrador: se creó "lmendez" (Méndez, Laura).');
    expect(r.stdout + r.stderr).not.toContain(CLAVE);
    expect(await prisma.usuario.count({ where: { nombreUsuario: 'lmendez' } })).toBe(1);
  });

  it('un mal uso termina con 2 y muestra el uso', () => {
    const r = instalar(['--sala', 'salas.csv']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Opción desconocida: --sala');
    expect(r.stderr).toContain('Uso: ');
  });
});
