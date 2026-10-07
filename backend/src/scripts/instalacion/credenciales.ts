import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import { ROLES, type CodigoRol } from '../../modulos/seguridad/catalogo-permisos';
import { esquemaContrasena } from '../../modulos/usuarios/usuarios.esquemas';
import { ErrorInstalacion } from './errores';

/**
 * Contraseñas temporales del personal que carga el instalador (T803 · D104). El sistema no tiene
 * "cambiar la contraseña en el primer ingreso": cada contraseña se escribe una sola vez en un
 * archivo, se entrega en mano y el administrador la cambia desde Usuarios.
 */

// Sin los caracteres que se confunden al leerla o dictarla: 0/O, 1/l/I.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Doce caracteres al azar (unos 70 bits) en tres grupos: "Hq7k-Rw3m-Zt9p". */
export function contrasenaTemporal(): string {
  for (;;) {
    const c = Array.from({ length: 12 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
    const contrasena = `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
    // Las mismas reglas que el alta: si al azar no quedó ninguna letra o ningún número, otra.
    if (esquemaContrasena.safeParse(contrasena).success) return contrasena;
  }
}

export interface Credencial {
  nombreUsuario: string;
  apellido: string;
  nombre: string;
  rol: CodigoRol;
  contrasena: string;
}

const celda = (valor: string) =>
  /[",\r\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor;

/**
 * Escribe el archivo de una sola vez, solo legible por quien corre el instalador (600), y nunca
 * pisa uno que ya existe (las contraseñas de una corrida anterior se perderían).
 */
export function escribirCredenciales(ruta: string, credenciales: Credencial[]) {
  const filas = [
    ['usuario', 'apellido', 'nombre', 'rol', 'contrasena_temporal'],
    ...credenciales.map((c) => [
      c.nombreUsuario,
      c.apellido,
      c.nombre,
      ROLES[c.rol].nombre,
      c.contrasena,
    ]),
  ];
  const contenido = `\uFEFF${filas.map((f) => `${f.map(celda).join(',')}\r\n`).join('')}`;
  try {
    fs.writeFileSync(ruta, contenido, { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ErrorInstalacion([
        `Ya existe ${ruta}: entregue esas contraseñas y borre el archivo, o indique otro con --credenciales`,
      ]);
    }
    throw e;
  }
}
