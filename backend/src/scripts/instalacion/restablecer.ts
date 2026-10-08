import type { PrismaClient } from '@prisma/client';
import { reloj } from '../../comun/reloj';
import type { ClienteDb } from '../../db';
import { registrarAuditoria } from '../../modulos/auditoria/auditoria.servicio';
import { cifrarContrasena } from '../../modulos/auth/contrasenas';
import { esquemaContrasena } from '../../modulos/usuarios/usuarios.esquemas';
import { preguntarContrasena, VARIABLES_ADMIN } from './administrador';
import { ErrorInstalacion } from './errores';
import type { Preguntador } from './terminal';

/**
 * Si el administrador olvidó la contraseña (D118 · docs/despliegue.md): `--restablecer-clave
 * USUARIO` le pone una nueva a un usuario Administrador activo, con las reglas del alta, y le
 * desbloquea la cuenta. Con terminal la contraseña se pregunta sin eco; sin terminal sale de
 * INSTALAR_ADMIN_CLAVE. Nunca se muestra. Queda en la auditoría sin actor, como todo lo que hace
 * el instalador (D105).
 */

interface Consola {
  info(linea: string): void;
  error(linea: string): void;
}

const CLAVE = VARIABLES_ADMIN.contrasena;

/**
 * Con una persona frente a la terminal, la contraseña se pregunta siempre: la variable puede haber
 * quedado exportada de la primera instalación y restablecería en silencio la contraseña vieja.
 * Solo sin terminal (un script, `docker compose run -T`) se toma de INSTALAR_ADMIN_CLAVE.
 */
async function nuevaContrasena(
  env: NodeJS.ProcessEnv,
  terminal: Preguntador | null,
  consola: Consola,
) {
  const valor = env[CLAVE];
  if (terminal) {
    if (valor) {
      consola.info(
        `Se ignora ${CLAVE}: con una persona frente a la terminal, la contraseña nueva se pregunta.`,
      );
    }
    return preguntarContrasena(terminal, consola);
  }
  if (!valor) {
    throw new ErrorInstalacion([
      `Falta ${CLAVE}: indíquela o corra el instalador en una terminal interactiva`,
    ]);
  }
  const r = esquemaContrasena.safeParse(valor);
  if (!r.success) {
    throw new ErrorInstalacion([`${CLAVE}: ${r.error.issues[0]?.message ?? 'no es válida'}`]);
  }
  return valor;
}

/** El Administrador activo con ese usuario; si no lo es, dice por qué. */
async function administradorPorUsuario(db: ClienteDb, nombreUsuario: string) {
  const u = await db.usuario.findUnique({ where: { nombreUsuario }, include: { rol: true } });
  if (!u) throw new ErrorInstalacion([`No hay ningún usuario "${nombreUsuario}"`]);
  if (u.rol.codigo !== 'ADMINISTRADOR') {
    throw new ErrorInstalacion([
      `El usuario "${nombreUsuario}" no es Administrador: su contraseña la cambia un administrador desde Usuarios`,
    ]);
  }
  if (!u.activo) {
    throw new ErrorInstalacion([
      `El usuario "${nombreUsuario}" está dado de baja: reactívelo desde Usuarios con otro administrador, o cree uno nuevo con el instalador si no queda ninguno activo`,
    ]);
  }
  return u;
}

export async function restablecerClave(
  usuarioIndicado: string,
  {
    env,
    preguntador,
    consola,
    db,
  }: {
    env: NodeJS.ProcessEnv;
    preguntador: Preguntador | null;
    consola: Consola;
    db: PrismaClient;
  },
): Promise<string[]> {
  // Como el ingreso: sin los espacios de alrededor y en minúsculas (D111).
  const nombreUsuario = usuarioIndicado.trim().toLowerCase();
  // Primero el usuario: no se pide una contraseña para alguien que no corresponde.
  await administradorPorUsuario(db, nombreUsuario);
  const hash = await cifrarContrasena(await nuevaContrasena(env, preguntador, consola));

  // La contraseña y su auditoría, juntas: si algo falla, no queda ninguna de las dos.
  return db.$transaction(async (tx) => {
    const u = await administradorPorUsuario(tx, nombreUsuario);
    const estabaBloqueada = u.bloqueadoHasta !== null && u.bloqueadoHasta > reloj.ahora();
    await tx.usuario.update({
      where: { id: u.id },
      data: { contrasenaHash: hash, intentosFallidos: 0, bloqueadoHasta: null },
    });
    await registrarAuditoria(tx, {
      usuarioId: null,
      accion: 'MODIFICAR',
      entidad: 'Usuario',
      entidadId: u.id,
      ...(u.bloqueadoHasta
        ? { anterior: { bloqueadoHasta: u.bloqueadoHasta }, nuevo: { bloqueadoHasta: null } }
        : {}),
      detalle: 'Instalador: restablecer contraseña',
    });
    const linea = `Contraseña restablecida para "${u.nombreUsuario}" (${u.apellido}, ${u.nombre}).`;
    return [estabaBloqueada ? `${linea} La cuenta estaba bloqueada y quedó desbloqueada.` : linea];
  });
}
