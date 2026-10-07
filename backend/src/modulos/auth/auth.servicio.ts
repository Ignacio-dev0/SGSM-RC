import { ErrorApi } from '../../comun/errores';
import { horaArgentina } from '../../comun/fechas';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { notificarAdministradores } from '../notificaciones/notificaciones.servicio';
import { verificarContrasena } from './contrasenas';

const credencialesInvalidas = () =>
  new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');

const cuentaBloqueada = (hasta: Date) =>
  new ErrorApi(
    423,
    'CUENTA_BLOQUEADA',
    `La cuenta está bloqueada por intentos fallidos hasta las ${horaArgentina(hasta)}`,
    { bloqueadoHasta: hasta.toISOString() },
  );

// Hash de una contraseña cualquiera: se compara aunque el usuario no exista para que el tiempo
// de respuesta no revele qué nombres de usuario son válidos.
const HASH_SENUELO = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.0Fh1dDuX2q1O0c1Tk3m1Wc6sG5wS';

/**
 * Valida usuario y contraseña (T105 · CU06). Devuelve el id del usuario o lanza
 * CREDENCIALES_INVALIDAS sin aclarar cuál de los dos datos falló.
 *
 * Bloqueo (T112): el intento fallido número `LOGIN_MAX_INTENTOS` seguido bloquea la cuenta
 * `LOGIN_BLOQUEO_MIN` minutos y notifica a los administradores. Mientras dura el bloqueo no se
 * evalúa la contraseña. Un ingreso correcto reinicia el contador.
 */
export async function iniciarSesion(nombreUsuario: string, contrasena: string): Promise<number> {
  const ahora = reloj.ahora();
  const usuario = await prisma.usuario.findUnique({ where: { nombreUsuario } });

  if (usuario?.activo && usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora) {
    throw cuentaBloqueada(usuario.bloqueadoHasta);
  }

  const valida = await verificarContrasena(contrasena, usuario?.contrasenaHash ?? HASH_SENUELO);

  if (!usuario || !usuario.activo) {
    await registrarAuditoria(prisma, {
      usuarioId: usuario?.id ?? null,
      accion: 'INICIAR_SESION_FALLIDO',
      entidad: 'Usuario',
      entidadId: usuario?.id ?? null,
      detalle: `Usuario ingresado: ${nombreUsuario.slice(0, 60)}`,
    });
    throw credencialesInvalidas();
  }

  if (!valida) {
    await registrarIntentoFallido(usuario.id, usuario.nombreUsuario, ahora);
    throw credencialesInvalidas();
  }

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcceso: ahora, intentosFallidos: 0, bloqueadoHasta: null },
    });
    await registrarAuditoria(tx, {
      usuarioId: usuario.id,
      accion: 'INICIAR_SESION',
      entidad: 'Usuario',
      entidadId: usuario.id,
    });
  });
  return usuario.id;
}

async function registrarIntentoFallido(usuarioId: number, nombreUsuario: string, ahora: Date) {
  const bloqueadoHasta = await prisma.$transaction(async (tx) => {
    // Incremento atómico: dos intentos simultáneos no pueden leer el mismo contador.
    const { intentosFallidos } = await tx.usuario.update({
      where: { id: usuarioId },
      data: { intentosFallidos: { increment: 1 } },
      select: { intentosFallidos: true },
    });
    await registrarAuditoria(tx, {
      usuarioId,
      accion: 'INICIAR_SESION_FALLIDO',
      entidad: 'Usuario',
      entidadId: usuarioId,
      detalle: `Intento fallido ${intentosFallidos} de ${config.login.maxIntentos}`,
    });
    if (intentosFallidos < config.login.maxIntentos) return null;

    const hasta = new Date(ahora.getTime() + config.login.bloqueoMinutos * 60_000);
    await tx.usuario.update({
      where: { id: usuarioId },
      data: { intentosFallidos: 0, bloqueadoHasta: hasta },
    });
    await registrarAuditoria(tx, {
      usuarioId,
      accion: 'BLOQUEAR_CUENTA',
      entidad: 'Usuario',
      entidadId: usuarioId,
      nuevo: { bloqueadoHasta: hasta },
      detalle: `${config.login.maxIntentos} intentos fallidos de inicio de sesión`,
    });
    await notificarAdministradores(tx, {
      tipo: 'CUENTA_BLOQUEADA',
      mensaje: `La cuenta "${nombreUsuario}" se bloqueó por ${config.login.maxIntentos} intentos fallidos de inicio de sesión`,
      datos: { usuarioId, bloqueadoHasta: hasta.toISOString() },
    });
    return hasta;
  });

  if (bloqueadoHasta) throw cuentaBloqueada(bloqueadoHasta);
}

export async function cerrarSesion(usuarioId: number) {
  await registrarAuditoria(prisma, {
    usuarioId,
    accion: 'CERRAR_SESION',
    entidad: 'Usuario',
    entidadId: usuarioId,
  });
}
