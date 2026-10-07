import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../db';
import { cifrarContrasena } from '../../modulos/auth/contrasenas';
import { sembrarDatosBase } from '../../semillas/catalogo-base';
import {
  administradorActivo,
  crearPrimerAdministrador,
  datosDelAdministrador,
} from './administrador';
import { cargarCatalogo, cargarPersonal, cargarSalas, type Conteo } from './cargas';
import { escribirCredenciales } from './credenciales';
import { leerCsv, type ColumnasCsv, type FilaCsv } from './csv';
import { ErrorInstalacion } from './errores';
import {
  COLUMNAS_CATALOGO,
  COLUMNAS_PERSONAL,
  COLUMNAS_SALAS,
  validarCatalogo,
  validarPersonal,
  validarSalas,
  type Validacion,
} from './filas';
import type { Preguntador } from './terminal';

/**
 * Instalador para la primera puesta en marcha (T803 · docs/despliegue.md, paso 7). Carga los
 * datos base, crea el primer administrador si no hay ninguno activo y, opcionalmente, los datos
 * reales del hospital desde CSV. Idempotente: solo agrega lo que falta. Primero valida todos los
 * archivos sin tocar la base; después hace todo en UNA transacción: si algo falla, no queda nada.
 */

export const USO = `Uso: node dist/scripts/instalar.js [opciones]  (en desarrollo: npm run instalar -w backend -- [opciones])

Carga los datos base (roles, permisos y tipos de estudio) y crea el primer administrador si no hay
ninguno activo. Se puede correr las veces que haga falta: solo agrega lo que falta.

  --salas ARCHIVO          salas y camas (columnas: sala, cama)
  --catalogo ARCHIVO       medicamentos e insumos (columnas: tipo, nombre, presentacion, unidad)
  --personal ARCHIVO       usuarios (columnas: usuario, nombre, apellido, dni, rol y email, opcional)
  --credenciales ARCHIVO   dónde escribir las contraseñas temporales del personal
                           (por defecto, credenciales-iniciales.csv junto al de --personal)
  --ayuda                  muestra esta ayuda

Primer administrador: INSTALAR_ADMIN_USUARIO, INSTALAR_ADMIN_NOMBRE, INSTALAR_ADMIN_APELLIDO,
INSTALAR_ADMIN_DNI e INSTALAR_ADMIN_CLAVE; lo que falte se pregunta si hay una terminal.
Detalle y ejemplos de los CSV: docs/despliegue.md (paso 7) y docs/ejemplos/.`;

export interface Consola {
  info(linea: string): void;
  error(linea: string): void;
}

export interface EntornoInstalador {
  env: NodeJS.ProcessEnv;
  consola: Consola;
  /** null si no hay una terminal interactiva: entonces no se pregunta nada. */
  preguntador: Preguntador | null;
  db?: PrismaClient;
}

interface Opciones {
  salas?: string;
  catalogo?: string;
  personal?: string;
  credenciales?: string;
  ayuda?: boolean;
}

class ErrorDeUso extends Error {}

const OPCIONES = {
  salas: { type: 'string' },
  catalogo: { type: 'string' },
  personal: { type: 'string' },
  credenciales: { type: 'string' },
  ayuda: { type: 'boolean', short: 'h' },
  help: { type: 'boolean' },
} as const;

function leerOpciones(args: string[]): Opciones {
  try {
    const { values } = parseArgs({ args, options: OPCIONES, strict: true });
    if (values.credenciales && !values.personal) {
      throw new ErrorDeUso('--credenciales solo sirve con --personal');
    }
    return { ...values, ayuda: values.ayuda || values.help };
  } catch (e) {
    if (e instanceof ErrorDeUso) throw e;
    const { code, message } = e as NodeJS.ErrnoException;
    const dato = /'([^']+)'/.exec(message)?.[1] ?? message;
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION')
      throw new ErrorDeUso(`Opción desconocida: ${dato}`);
    if (code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL') {
      throw new ErrorDeUso(
        `Sobra "${dato}": cada archivo va después de su opción (--salas salas.csv)`,
      );
    }
    throw new ErrorDeUso(`Falta el archivo de una opción: ${message}`);
  }
}

interface Archivo<T> {
  nombre: string;
  filas: T[];
}

/** Lee y valida un CSV sin tocar la base; anota los errores con el nombre del archivo. */
function leerArchivo<T>(
  ruta: string,
  columnas: ColumnasCsv,
  validar: (filas: FilaCsv[]) => Validacion<T>,
  errores: string[],
): Archivo<T> | null {
  let contenido: Buffer;
  try {
    contenido = fs.readFileSync(ruta);
  } catch (e) {
    const { code, message } = e as NodeJS.ErrnoException;
    errores.push(
      code === 'ENOENT'
        ? `No se encontró el archivo ${ruta}`
        : `No se pudo leer ${ruta}: ${message}`,
    );
    return null;
  }
  const nombre = path.basename(ruta);
  const tabla = leerCsv(contenido, columnas);
  const { filas, errores: propios } =
    tabla.errores.length > 0 ? { filas: [], errores: tabla.errores } : validar(tabla.filas);
  errores.push(...propios.map((e) => `${nombre}: ${e}`));
  return propios.length > 0 ? null : { nombre, filas };
}

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const yaEstaban = (n: number) => `(${n} ${n === 1 ? 'ya estaba' : 'ya estaban'})`;
const conteo = (c: Conteo, uno: string, varios: string) =>
  `${cuantos(c.nuevos, uno, varios)} ${yaEstaban(c.existentes)}`;

function lineaCredenciales(cantidad: number, ruta: string) {
  return cantidad === 1
    ? `Contraseña temporal del usuario nuevo en ${ruta}: entréguela en mano, el administrador la cambia desde Usuarios y después borre el archivo.`
    : `Contraseñas temporales de los ${cantidad} usuarios nuevos en ${ruta}: entréguelas en mano, el administrador las cambia desde Usuarios y después borre el archivo.`;
}

async function instalar(
  opciones: Opciones,
  { env, consola, preguntador, db = prisma }: EntornoInstalador,
): Promise<string[]> {
  // 1. Todos los archivos, antes de tocar la base.
  const errores: string[] = [];
  const salas = opciones.salas
    ? leerArchivo(opciones.salas, COLUMNAS_SALAS, validarSalas, errores)
    : null;
  const catalogo = opciones.catalogo
    ? leerArchivo(opciones.catalogo, COLUMNAS_CATALOGO, validarCatalogo, errores)
    : null;
  const personal = opciones.personal
    ? leerArchivo(opciones.personal, COLUMNAS_PERSONAL, validarPersonal, errores)
    : null;
  if (errores.length > 0) throw new ErrorInstalacion(errores);

  // 2. El primer administrador, si no hay ninguno activo (se pregunta antes de la transacción).
  const existente = await administradorActivo(db);
  const admin = existente ? null : await datosDelAdministrador(env, preguntador, consola);
  const hash = admin ? await cifrarContrasena(admin.contrasena) : '';

  // 3. Todo junto: si algo falla, no queda nada (ni el archivo de credenciales).
  const credenciales = opciones.personal
    ? (opciones.credenciales ??
      path.join(path.dirname(path.resolve(opciones.personal)), 'credenciales-iniciales.csv'))
    : '';
  const escrito = { archivo: false };
  try {
    return await db.$transaction(
      async (tx) => {
        const lineas: string[] = [];
        const base = await sembrarDatosBase(tx);
        lineas.push(
          `Datos base: ${base.roles} roles y ${base.permisos} permisos al día con esta versión; ` +
            `tipos de estudio: ${conteo(base.tiposEstudio, 'nuevo', 'nuevos')}.`,
        );
        if (admin) {
          const { contrasena: _, ...datos } = admin;
          await crearPrimerAdministrador(tx, datos, hash);
          lineas.push(
            `Primer administrador: se creó "${admin.nombreUsuario}" (${admin.apellido}, ${admin.nombre}).`,
          );
        } else {
          lineas.push(
            `Primer administrador: ya hay uno activo ("${existente!.nombreUsuario}"), no se creó otro.`,
          );
        }
        if (salas) {
          const r = await cargarSalas(tx, salas.filas, salas.nombre);
          lineas.push(
            `${salas.nombre}: ${conteo(r.salas, 'sala nueva', 'salas nuevas')} y ` +
              `${conteo(r.camas, 'cama nueva', 'camas nuevas')}.`,
          );
        }
        if (catalogo) {
          const r = await cargarCatalogo(tx, catalogo.filas, catalogo.nombre);
          lineas.push(
            `${catalogo.nombre}: ${conteo(r, 'medicamento o insumo nuevo', 'medicamentos e insumos nuevos')}.`,
          );
        }
        if (personal) {
          const r = await cargarPersonal(tx, personal.filas, personal.nombre);
          lineas.push(
            `${personal.nombre}: ${conteo(r.usuarios, 'usuario nuevo', 'usuarios nuevos')}.`,
          );
          if (r.credenciales.length > 0) {
            escribirCredenciales(credenciales, r.credenciales);
            escrito.archivo = true;
            lineas.push(lineaCredenciales(r.credenciales.length, credenciales));
          }
        }
        if ((await tx.cama.count()) === 0) {
          lineas.push(
            'Aviso: no hay camas cargadas y sin ellas no se puede internar: cárguelas con --salas.',
          );
        }
        if ((await tx.insumo.count({ where: { activo: true } })) === 0) {
          lineas.push(
            'Aviso: el catálogo de medicamentos e insumos está vacío: cárguelo con --catalogo o desde Catálogo.',
          );
        }
        lineas.push('Instalación terminada.');
        return lineas;
      },
      // Cada contraseña temporal es un bcrypt: con cientos de personas tarda más que los 5 s.
      { timeout: 10 * 60_000, maxWait: 60_000 },
    );
  } catch (e) {
    // Las contraseñas del archivo no corresponden a nadie: la transacción se deshizo.
    if (escrito.archivo) fs.rmSync(credenciales, { force: true });
    throw e;
  }
}

/** Corre el instalador y devuelve el código de salida: 0 bien, 1 datos con errores, 2 mal uso. */
export async function ejecutarInstalador(
  args: string[],
  entorno: EntornoInstalador,
): Promise<number> {
  const { consola } = entorno;
  let opciones: Opciones;
  try {
    opciones = leerOpciones(args);
  } catch (e) {
    if (!(e instanceof ErrorDeUso)) throw e;
    consola.error(e.message);
    consola.error('');
    consola.error(USO);
    return 2;
  }
  if (opciones.ayuda) {
    consola.info(USO);
    return 0;
  }
  try {
    for (const linea of await instalar(opciones, entorno)) consola.info(linea);
    return 0;
  } catch (e) {
    if (e instanceof Error && e.message === 'Instalación cancelada') {
      consola.error('Instalación cancelada: no se cargó nada.');
      return 1;
    }
    if (!(e instanceof ErrorInstalacion)) throw e;
    consola.error('No se cargó nada. Corrija lo siguiente y vuelva a correr el instalador:');
    for (const linea of e.lineas) consola.error(`  ${linea}`);
    return 1;
  }
}
