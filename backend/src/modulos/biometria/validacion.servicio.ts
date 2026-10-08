import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ErrorApi, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { notificarAdministradores } from '../notificaciones/notificaciones.servicio';
import { descifrarPatron, leerDatoBiometrico } from './cifrado-biometrico';
import { compararPatrones } from './comparacion';

/**
 * Validación facial (CU10 · T404 · T407). Compara el rostro capturado en la tablet con el patrón
 * registrado del usuario que tiene la sesión abierta (validación 1:1). Si coincide, entrega un
 * comprobante firmado, de corta duración y de un solo uso, que exigen las operaciones que piden
 * confirmación facial (registrar o corregir un suministro).
 *
 * Tres validaciones fallidas seguidas cancelan la operación, quedan en la auditoría y notifican
 * a los administradores.
 */

const AUDIENCIA = 'validacion-facial';

export type ResultadoValidacion =
  | { valido: true; validacionToken: string; similitud: number }
  | { valido: false; intentosRestantes: number; cancelada: boolean };

const segundos = (d: Date) => Math.floor(d.getTime() / 1000);

function emitirComprobante(usuarioId: number) {
  const ahora = segundos(reloj.ahora());
  return jwt.sign(
    {
      sub: String(usuarioId),
      aud: AUDIENCIA,
      jti: randomUUID(),
      iat: ahora,
      exp: ahora + config.biometria.validezSegundos,
    },
    config.sesion.secreto,
    { algorithm: 'HS256' },
  );
}

export async function validarRostro(
  usuarioId: number,
  patron: number[],
  operacion = 'Operación con confirmación facial',
): Promise<ResultadoValidacion> {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    include: { datoBiometrico: { select: { patronCifrado: true } } },
  });
  if (!usuario.datoBiometrico) {
    throw reglaNegocio(
      'SIN_BIOMETRIA',
      'No tiene el rostro registrado. Pídale al administrador que lo registre.',
    );
  }

  // El patrón registrado se descifra solo en memoria, para esta comparación (T705).
  const { patronCifrado } = usuario.datoBiometrico;
  const registrado = leerDatoBiometrico(usuarioId, () => descifrarPatron(usuarioId, patronCifrado));
  const r = compararPatrones(registrado, patron, config.biometria.umbral);
  if (r.coincide) {
    await prisma.usuario.update({
      where: { id: usuarioId },
      data: { intentosBiometricosFallidos: 0 },
    });
    return { valido: true, validacionToken: emitirComprobante(usuarioId), similitud: r.similitud };
  }

  return prisma.$transaction(async (tx) => {
    const { intentosBiometricosFallidos: intentos } = await tx.usuario.update({
      where: { id: usuarioId },
      data: { intentosBiometricosFallidos: { increment: 1 } },
      select: { intentosBiometricosFallidos: true },
    });
    await registrarAuditoria(tx, {
      usuarioId,
      accion: 'VALIDACION_FACIAL_FALLIDA',
      entidad: 'Usuario',
      entidadId: usuarioId,
      detalle: `${operacion} · intento ${intentos} de ${config.biometria.maxIntentos} · distancia ${r.distancia.toFixed(3)}`,
    });
    if (intentos < config.biometria.maxIntentos) {
      return {
        valido: false,
        intentosRestantes: config.biometria.maxIntentos - intentos,
        cancelada: false,
      };
    }

    await tx.usuario.update({ where: { id: usuarioId }, data: { intentosBiometricosFallidos: 0 } });
    await registrarAuditoria(tx, {
      usuarioId,
      accion: 'OPERACION_CANCELADA',
      entidad: 'Usuario',
      entidadId: usuarioId,
      detalle: `${operacion}: ${config.biometria.maxIntentos} validaciones faciales fallidas`,
    });
    await notificarAdministradores(tx, {
      tipo: 'VALIDACION_FACIAL_FALLIDA',
      mensaje: `Se canceló "${operacion}" de ${usuario.nombreUsuario} (${usuario.apellido}, ${usuario.nombre}) por ${config.biometria.maxIntentos} validaciones faciales fallidas`,
      datos: { usuarioId, operacion },
    });
    return { valido: false, intentosRestantes: 0, cancelada: true };
  });
}

/** Comprobantes ya usados (identificador → vencimiento). Ver la limitación en docs/biometria.md. */
const usados = new Map<string, number>();

const validacionRequerida = (mensaje = 'La operación requiere una validación facial vigente') =>
  new ErrorApi(403, 'VALIDACION_FACIAL_REQUERIDA', mensaje);

/**
 * Verifica el comprobante de una validación facial sin gastarlo: tiene que ser del usuario que
 * hace la operación, no estar vencido y no haberse usado antes. Lo usa quien todavía puede
 * rechazar la operación por una regla que la persona resuelve y reenvía (TOMA_YA_DADA, D113).
 */
export function comprobarValidacion(token: unknown, usuarioId: number) {
  leerComprobante(token, usuarioId);
}

/** Verifica y consume el comprobante: después de esto ya no sirve para otra operación. */
export function consumirValidacion(token: unknown, usuarioId: number) {
  const { jti, vence } = leerComprobante(token, usuarioId);
  usados.set(jti, vence);
}

function leerComprobante(token: unknown, usuarioId: number) {
  if (typeof token !== 'string' || token === '') throw validacionRequerida();
  const ahora = segundos(reloj.ahora());
  let datos: jwt.JwtPayload;
  try {
    datos = jwt.verify(token, config.sesion.secreto, {
      algorithms: ['HS256'],
      audience: AUDIENCIA,
      clockTimestamp: ahora,
    }) as jwt.JwtPayload;
  } catch (e) {
    throw validacionRequerida(
      e instanceof jwt.TokenExpiredError
        ? 'La validación facial está vencida. Vuelva a validar su rostro.'
        : undefined,
    );
  }
  if (datos.sub !== String(usuarioId) || !datos.jti) throw validacionRequerida();

  for (const [jti, vence] of usados) if (vence < ahora) usados.delete(jti);
  if (usados.has(datos.jti)) {
    throw validacionRequerida('Esa validación facial ya se usó. Vuelva a validar su rostro.');
  }
  return { jti: datos.jti, vence: datos.exp ?? ahora };
}
