import type { TipoInsumo } from '@prisma/client';
import type { z } from 'zod';
import { esquemaAltaInsumo } from '../../modulos/insumos/insumos.esquemas';
import type { CodigoRol } from '../../modulos/seguridad/catalogo-permisos';
import { esquemaAltaUsuario } from '../../modulos/usuarios/usuarios.esquemas';
import { normalizarEncabezado, type ColumnasCsv, type FilaCsv } from './csv';

/**
 * Validación fila por fila de los CSV del instalador (T803 · D103), sin tocar la base. Cada error
 * dice la fila, el campo (la columna del archivo) y lo que dice la celda. El catálogo y el personal
 * usan los mismos esquemas que el alta desde la aplicación.
 */

export const COLUMNAS_SALAS: ColumnasCsv = { obligatorias: ['sala', 'cama'] };
export const COLUMNAS_CATALOGO: ColumnasCsv = {
  obligatorias: ['tipo', 'nombre', 'presentacion', 'unidad'],
};
export const COLUMNAS_PERSONAL: ColumnasCsv = {
  obligatorias: ['usuario', 'nombre', 'apellido', 'dni', 'rol'],
  opcionales: ['email'],
};

export interface FilaSala {
  fila: number;
  sala: string;
  cama: string;
}

export interface FilaCatalogo {
  fila: number;
  tipo: TipoInsumo;
  nombre: string;
  presentacion: string;
  unidadMedida: string;
}

export interface FilaPersonal {
  fila: number;
  nombreUsuario: string;
  nombre: string;
  apellido: string;
  dni: string;
  rol: CodigoRol;
  email: string | null;
}

export interface Validacion<T> {
  filas: T[];
  /** Si hay alguno, `filas` viene vacía. */
  errores: string[];
}

/** Para comparar nombres sin mayúsculas, tildes ni espacios de más. */
export const clave = (texto: string) => normalizarEncabezado(texto).replace(/\s+/g, ' ');

/** "Médica" → "MEDICA": los valores fijos se escriben como se leen. */
const codigo = (texto: string) => clave(texto).toUpperCase();

const espacios = (texto: string) => texto.replace(/\s+/g, ' ').trim();

const corto = (texto: string) => (texto.length > 40 ? `${texto.slice(0, 40)}…` : texto);

function error(fila: number, campo: string, mensaje: string, valor = '') {
  return `Fila ${fila}, ${campo}: ${mensaje}${valor ? ` (dice "${corto(valor)}")` : ''}`;
}

/** Mensajes en castellano para las reglas que no traen uno propio (largo máximo, mínimo). */
const enCastellano = (issue: { code?: string; maximum?: unknown; minimum?: unknown }) => {
  if (issue.code === 'too_big') return `Puede tener hasta ${String(issue.maximum)} caracteres`;
  if (issue.code === 'too_small') return `Debe tener al menos ${String(issue.minimum)} caracteres`;
  return undefined;
};

/**
 * Valida una fila con un esquema de la aplicación. `campos` traduce cada campo del esquema a su
 * columna del archivo; `mensajes`, los que cambian en el archivo (rol, tipo).
 */
function validarFila<T>(
  fila: FilaCsv,
  esquema: z.ZodType<T>,
  datos: Record<string, unknown>,
  campos: Record<string, string>,
  mensajes: Record<string, string> = {},
): { datos: T } | { errores: string[] } {
  const r = esquema.safeParse(datos, { error: enCastellano });
  if (r.success) return { datos: r.data };
  const columnas = Object.keys(fila.valores);
  const porColumna = r.error.issues.map((i) => {
    const campo = String(i.path[0] ?? '');
    return { columna: campos[campo] ?? campo, mensaje: mensajes[campo] ?? i.message };
  });
  porColumna.sort((a, b) => columnas.indexOf(a.columna) - columnas.indexOf(b.columna));
  return {
    errores: porColumna.map(({ columna, mensaje }) =>
      error(fila.numero, columna, mensaje, fila.valores[columna]),
    ),
  };
}

/** Junta las filas válidas o, si hubo algún error, solo los errores. */
function resultado<T>(filas: T[], errores: string[]): Validacion<T> {
  return errores.length > 0 ? { filas: [], errores } : { filas, errores: [] };
}

export function validarSalas(filas: FilaCsv[]): Validacion<FilaSala> {
  const validas: FilaSala[] = [];
  const errores: string[] = [];
  const salas = new Map<string, { nombre: string; fila: number }>();
  const camas = new Map<string, number>();
  for (const f of filas) {
    const sala = espacios(f.valores.sala ?? '');
    const cama = espacios(f.valores.cama ?? '');
    const propios: string[] = [];
    if (!sala) propios.push(error(f.numero, 'sala', 'Escriba el nombre de la sala'));
    else if (sala.length > 60) {
      propios.push(
        error(f.numero, 'sala', 'El nombre de la sala puede tener hasta 60 caracteres', sala),
      );
    }
    if (!cama) propios.push(error(f.numero, 'cama', 'Escriba el número o nombre de la cama'));
    else if (cama.length > 10) {
      propios.push(error(f.numero, 'cama', 'La cama puede tener hasta 10 caracteres', cama));
    }
    if (propios.length > 0) {
      errores.push(...propios);
      continue;
    }
    const anterior = salas.get(clave(sala));
    if (anterior && anterior.nombre !== sala) {
      errores.push(
        `Fila ${f.numero}, sala: "${sala}" está escrita distinto que "${anterior.nombre}" en la fila ${anterior.fila}: escríbala igual en todas las filas`,
      );
      continue;
    }
    salas.set(clave(sala), anterior ?? { nombre: sala, fila: f.numero });
    const repetida = camas.get(`${clave(sala)}|${clave(cama)}`);
    if (repetida) {
      errores.push(
        `Fila ${f.numero}, cama: la cama "${cama}" de "${sala}" ya está en la fila ${repetida}`,
      );
      continue;
    }
    camas.set(`${clave(sala)}|${clave(cama)}`, f.numero);
    validas.push({ fila: f.numero, sala, cama });
  }
  return resultado(validas, errores);
}

export function validarCatalogo(filas: FilaCsv[]): Validacion<FilaCatalogo> {
  const validas: FilaCatalogo[] = [];
  const errores: string[] = [];
  const vistos = new Map<string, number>();
  for (const f of filas) {
    const v = f.valores;
    const r = validarFila(
      f,
      esquemaAltaInsumo,
      {
        tipo: codigo(v.tipo ?? ''),
        nombre: espacios(v.nombre ?? ''),
        presentacion: espacios(v.presentacion ?? ''),
        unidadMedida: espacios(v.unidad ?? ''),
      },
      { unidadMedida: 'unidad' },
      { tipo: 'Escriba Medicamento o Insumo' },
    );
    if ('errores' in r) {
      errores.push(...r.errores);
      continue;
    }
    const { nombre, presentacion } = r.datos;
    const k = `${clave(nombre)}|${clave(presentacion)}`;
    const repetido = vistos.get(k);
    if (repetido) {
      const etiqueta = presentacion ? `${nombre} · ${presentacion}` : nombre;
      errores.push(`Fila ${f.numero}, nombre: "${etiqueta}" ya está en la fila ${repetido}`);
      continue;
    }
    vistos.set(k, f.numero);
    validas.push({ fila: f.numero, ...r.datos });
  }
  return resultado(validas, errores);
}

/** Los roles como se escriben en una planilla (también en femenino). */
const ROLES_EN_PALABRAS: Record<string, CodigoRol> = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  ADMINISTRADORA: 'ADMINISTRADOR',
  MEDICO: 'MEDICO',
  MEDICA: 'MEDICO',
  ENFERMERO: 'ENFERMERO',
  ENFERMERA: 'ENFERMERO',
};

const esquemaPersonal = esquemaAltaUsuario.omit({ contrasena: true, matricula: true });

export function validarPersonal(filas: FilaCsv[]): Validacion<FilaPersonal> {
  const validas: FilaPersonal[] = [];
  const errores: string[] = [];
  const usuarios = new Map<string, number>();
  const dnis = new Map<string, number>();
  for (const f of filas) {
    const v = f.valores;
    const rol = codigo(v.rol ?? '');
    const r = validarFila(
      f,
      esquemaPersonal,
      {
        nombreUsuario: v.usuario ?? '',
        nombre: espacios(v.nombre ?? ''),
        apellido: espacios(v.apellido ?? ''),
        // Un DNI escrito con puntos o espacios (30.111.222) se acepta sin ellos.
        dni: (v.dni ?? '').replace(/[.\s]/g, ''),
        rol: ROLES_EN_PALABRAS[rol] ?? rol,
        email: v.email ?? '',
      },
      { nombreUsuario: 'usuario' },
      { rol: 'Escriba Administrador, Médico o Enfermero' },
    );
    if ('errores' in r) {
      errores.push(...r.errores);
      continue;
    }
    const d = r.datos;
    const usuarioRepetido = usuarios.get(d.nombreUsuario);
    const dniRepetido = dnis.get(d.dni);
    if (usuarioRepetido) {
      errores.push(
        `Fila ${f.numero}, usuario: el usuario "${d.nombreUsuario}" ya está en la fila ${usuarioRepetido}`,
      );
    } else if (dniRepetido) {
      errores.push(`Fila ${f.numero}, dni: el DNI ${d.dni} ya está en la fila ${dniRepetido}`);
    } else {
      usuarios.set(d.nombreUsuario, f.numero);
      dnis.set(d.dni, f.numero);
      validas.push({
        fila: f.numero,
        nombreUsuario: d.nombreUsuario,
        nombre: d.nombre,
        apellido: d.apellido,
        dni: d.dni,
        rol: d.rol,
        email: d.email,
      });
    }
  }
  return resultado(validas, errores);
}
