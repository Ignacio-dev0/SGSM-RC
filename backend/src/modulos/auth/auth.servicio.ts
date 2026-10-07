import { ErrorApi } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { verificarContrasena } from './contrasenas';

const credencialesInvalidas = () =>
  new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');

// Hash de una contraseña cualquiera: se compara aunque el usuario no exista para que el tiempo
// de respuesta no revele qué nombres de usuario son válidos.
const HASH_SENUELO = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.0Fh1dDuX2q1O0c1Tk3m1Wc6sG5wS';

/**
 * Valida usuario y contraseña (T105 · CU06). Devuelve el id del usuario o lanza
 * CREDENCIALES_INVALIDAS sin aclarar cuál de los dos datos falló.
 */
export async function iniciarSesion(nombreUsuario: string, contrasena: string): Promise<number> {
  const usuario = await prisma.usuario.findUnique({ where: { nombreUsuario } });
  const valida = await verificarContrasena(contrasena, usuario?.contrasenaHash ?? HASH_SENUELO);

  if (!usuario || !usuario.activo || !valida) {
    await registrarAuditoria(prisma, {
      usuarioId: usuario?.id ?? null,
      accion: 'INICIAR_SESION_FALLIDO',
      entidad: 'Usuario',
      entidadId: usuario?.id ?? null,
      detalle: `Usuario ingresado: ${nombreUsuario.slice(0, 60)}`,
    });
    throw credencialesInvalidas();
  }

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: usuario.id }, data: { ultimoAcceso: reloj.ahora() } });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      accion: 'INICIAR_SESION',
      entidad: 'Usuario',
      entidadId: usuario.id,
    });
  });
  return usuario.id;
}

export async function cerrarSesion(usuarioId: number) {
  await registrarAuditoria(prisma, {
    usuarioId,
    accion: 'CERRAR_SESION',
    entidad: 'Usuario',
    entidadId: usuarioId,
  });
}
