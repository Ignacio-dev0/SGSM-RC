import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { esquemaContrasena } from '../../modulos/usuarios/usuarios.esquemas';
import { contrasenaTemporal, escribirCredenciales } from './credenciales';

/** Contraseñas temporales del personal cargado por el instalador (T803 · D104). */
describe('credenciales iniciales', () => {
  let carpeta: string;
  beforeEach(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'sgsm-credenciales-'));
  });
  afterEach(() => fs.rmSync(carpeta, { recursive: true, force: true }));

  it('la contraseña temporal cumple las reglas del alta y no se repite', () => {
    const generadas = Array.from({ length: 200 }, () => contrasenaTemporal());
    for (const c of generadas) {
      expect(esquemaContrasena.safeParse(c).success).toBe(true);
      // Tres grupos de cuatro, sin caracteres que se confunden al dictarla (0/O, 1/l/I).
      expect(c).toMatch(
        /^[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/,
      );
    }
    expect(new Set(generadas).size).toBe(generadas.length);
  });

  it('escribe un CSV en UTF-8 con BOM (Excel lee las tildes), una fila por usuario con su rol', () => {
    const ruta = path.join(carpeta, 'credenciales-iniciales.csv');
    escribirCredenciales(ruta, [
      {
        nombreUsuario: 'jperez',
        apellido: 'Pérez',
        nombre: 'Juana',
        rol: 'MEDICO',
        contrasena: 'Abcd-Efgh-2345',
      },
      {
        nombreUsuario: 'mgomez',
        apellido: 'Gómez, hijo',
        nombre: 'Mario',
        rol: 'ENFERMERO',
        contrasena: 'Wxyz-Mnpq-6789',
      },
    ]);
    const contenido = fs.readFileSync(ruta);
    expect(contenido.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(contenido.subarray(3).toString('utf8')).toBe(
      'usuario,apellido,nombre,rol,contrasena_temporal\r\n' +
        'jperez,Pérez,Juana,Médico,Abcd-Efgh-2345\r\n' +
        'mgomez,"Gómez, hijo",Mario,Enfermero,Wxyz-Mnpq-6789\r\n',
    );
  });

  it('solo la puede leer el usuario que corrió el instalador (permisos 600)', () => {
    const ruta = path.join(carpeta, 'credenciales.csv');
    escribirCredenciales(ruta, []);
    // Windows no tiene los permisos de POSIX: ahí el archivo hereda los de la carpeta.
    if (process.platform !== 'win32') {
      expect(fs.statSync(ruta).mode & 0o777).toBe(0o600);
    }
  });

  it('nunca pisa un archivo que ya existe: falla con un mensaje que dice qué hacer', () => {
    const ruta = path.join(carpeta, 'credenciales-iniciales.csv');
    fs.writeFileSync(ruta, 'contraseñas de la vez anterior');
    expect(() => escribirCredenciales(ruta, [])).toThrow(
      `Ya existe ${ruta}: entregue esas contraseñas y borre el archivo, o indique otro con --credenciales`,
    );
    expect(fs.readFileSync(ruta, 'utf8')).toBe('contraseñas de la vez anterior');
  });
});
