import type { ClienteDb } from '../../db';
import { registrarAuditoria } from '../../modulos/auditoria/auditoria.servicio';
import { esquemaAltaUsuario } from '../../modulos/usuarios/usuarios.esquemas';
import { ErrorInstalacion } from './errores';
import type { Preguntador } from './terminal';

/**
 * El primer administrador (T803 · D105). Solo se crea si no hay ningún usuario Administrador
 * activo. Sus datos salen de las variables INSTALAR_ADMIN_* o, si faltan y hay una terminal, se
 * preguntan (la contraseña sin eco y dos veces). Se valida con el mismo esquema que el alta de
 * usuarios y la contraseña nunca se muestra.
 */

export const VARIABLES_ADMIN = {
  nombreUsuario: 'INSTALAR_ADMIN_USUARIO',
  nombre: 'INSTALAR_ADMIN_NOMBRE',
  apellido: 'INSTALAR_ADMIN_APELLIDO',
  dni: 'INSTALAR_ADMIN_DNI',
  contrasena: 'INSTALAR_ADMIN_CLAVE',
} as const;

type Campo = keyof typeof VARIABLES_ADMIN;
const CAMPOS = Object.keys(VARIABLES_ADMIN) as Campo[];

export type DatosAdministrador = Record<Campo, string>;

const PREGUNTAS: Record<Exclude<Campo, 'contrasena'>, string> = {
  nombreUsuario: 'Usuario',
  nombre: 'Nombre',
  apellido: 'Apellido',
  dni: 'DNI (sin puntos)',
};

const INTENTOS = 5;

interface Consola {
  info(linea: string): void;
  error(linea: string): void;
}

/** Como en el CSV del personal, un DNI con puntos o espacios se acepta sin ellos. */
const limpiar = (campo: Campo, valor: string) =>
  campo === 'dni' ? valor.replace(/[.\s]/g, '') : valor;

/** El mensaje de la regla que no cumple el valor, o null si está bien. */
function problema(campo: Campo, valor: string): string | null {
  const r = esquemaAltaUsuario.shape[campo].safeParse(limpiar(campo, valor));
  return r.success ? null : (r.error.issues[0]?.message ?? 'El valor no es válido');
}

async function preguntarCampo(
  campo: Exclude<Campo, 'contrasena'>,
  terminal: Preguntador,
  consola: Consola,
) {
  for (let intento = 0; intento < INTENTOS; intento++) {
    const valor = await terminal.preguntar(`${PREGUNTAS[campo]}: `);
    const mensaje = problema(campo, valor);
    if (!mensaje) return valor;
    consola.error(`  ${mensaje}`);
  }
  throw new ErrorInstalacion([
    `Demasiados intentos para "${PREGUNTAS[campo]}": instalación cancelada`,
  ]);
}

/** La contraseña sin eco y dos veces, con las reglas del alta (también al restablecerla, D118). */
export async function preguntarContrasena(terminal: Preguntador, consola: Consola) {
  for (let intento = 0; intento < INTENTOS; intento++) {
    const valor = await terminal.preguntarOculto('Contraseña (no se muestra al escribirla): ');
    const mensaje = problema('contrasena', valor);
    if (mensaje) {
      consola.error(`  ${mensaje}`);
      continue;
    }
    if ((await terminal.preguntarOculto('Repita la contraseña: ')) === valor) return valor;
    consola.error('  Las contraseñas no coinciden');
  }
  throw new ErrorInstalacion(['Demasiados intentos para "Contraseña": instalación cancelada']);
}

export async function datosDelAdministrador(
  env: NodeJS.ProcessEnv,
  terminal: Preguntador | null,
  consola: Consola,
): Promise<DatosAdministrador> {
  const datos: Partial<DatosAdministrador> = {};
  for (const campo of CAMPOS) {
    const valor = env[VARIABLES_ADMIN[campo]];
    if (valor) datos[campo] = valor;
  }
  const errores = CAMPOS.flatMap((campo) => {
    const valor = datos[campo];
    const mensaje = valor === undefined ? null : problema(campo, valor);
    return mensaje ? [`${VARIABLES_ADMIN[campo]}: ${mensaje}`] : [];
  });
  if (errores.length > 0) throw new ErrorInstalacion(errores);

  const faltan = CAMPOS.filter((campo) => datos[campo] === undefined);
  if (faltan.length > 0 && !terminal) {
    throw new ErrorInstalacion([
      `No hay ningún administrador activo y faltan ${faltan.map((c) => VARIABLES_ADMIN[c]).join(', ')}: ` +
        'indíquelas o corra el instalador en una terminal interactiva',
    ]);
  }
  if (faltan.length > 0 && terminal) {
    consola.info('No hay ningún administrador activo: se va a crear el primero.');
    for (const campo of faltan) {
      datos[campo] =
        campo === 'contrasena'
          ? await preguntarContrasena(terminal, consola)
          : await preguntarCampo(campo, terminal, consola);
    }
  }
  const completo = datos as DatosAdministrador;
  // Normalizado como el alta (recorta espacios, usuario en minúsculas).
  const r = esquemaAltaUsuario.parse({
    ...completo,
    dni: limpiar('dni', completo.dni),
    rol: 'ADMINISTRADOR',
  });
  return {
    nombreUsuario: r.nombreUsuario,
    nombre: r.nombre,
    apellido: r.apellido,
    dni: r.dni,
    contrasena: r.contrasena,
  };
}

/** El primer administrador activo, si hay alguno. */
export function administradorActivo(db: ClienteDb) {
  return db.usuario.findFirst({
    where: { activo: true, rol: { codigo: 'ADMINISTRADOR' } },
    orderBy: { id: 'asc' },
    select: { nombreUsuario: true, apellido: true, nombre: true },
  });
}

/**
 * Crea el primer administrador y lo audita (CREAR · Usuario) sin usuario actor: no lo hizo una
 * persona con sesión sino el instalador, y así queda en el origen "sistema" (D105).
 */
export async function crearPrimerAdministrador(
  tx: ClienteDb,
  datos: Omit<DatosAdministrador, 'contrasena'>,
  contrasenaHash: string,
) {
  const choca = await tx.usuario.findFirst({
    where: { OR: [{ nombreUsuario: datos.nombreUsuario }, { dni: datos.dni }] },
    select: { nombreUsuario: true, activo: true },
  });
  if (choca) {
    const estado = choca.activo ? 'activo' : 'dado de baja';
    throw new ErrorInstalacion([
      `Ya hay un usuario "${choca.nombreUsuario}" (${estado}) con ese usuario o DNI: ` +
        'elija otros datos para el primer administrador',
    ]);
  }
  const rol = await tx.rol.findUniqueOrThrow({ where: { codigo: 'ADMINISTRADOR' } });
  const creado = await tx.usuario.create({
    data: { ...datos, contrasenaHash, rolId: rol.id },
  });
  await registrarAuditoria(tx, {
    usuarioId: null,
    accion: 'CREAR',
    entidad: 'Usuario',
    entidadId: creado.id,
    nuevo: {
      nombreUsuario: creado.nombreUsuario,
      dni: creado.dni,
      nombre: creado.nombre,
      apellido: creado.apellido,
      email: creado.email,
      matricula: creado.matricula,
      rol: rol.codigo,
      activo: creado.activo,
    },
    detalle: 'Primer administrador, creado por el instalador',
  });
  return creado;
}
