import type { z } from 'zod';
import { noEncontrado } from '../../comun/errores';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { DATA_URL, type esquemaRegistroBiometrico } from './biometria.esquemas';
import { cifrarDatoBiometrico, descifrarFoto, leerDatoBiometrico } from './cifrado-biometrico';

/**
 * Datos biométricos del personal (T403 · CU07–CU09): el patrón facial y la foto de referencia.
 * Los registra, actualiza y elimina el administrador. Se guardan cifrados (T705 · RNF06). La
 * auditoría nunca guarda el patrón ni la foto, solo que la operación ocurrió.
 */

async function usuarioExistente(id: number) {
  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) throw noEncontrado('El usuario no existe');
  return u;
}

export async function listarPersonal() {
  const usuarios = await prisma.usuario.findMany({
    where: { activo: true },
    include: { rol: true, datoBiometrico: { select: { actualizadoEn: true } } },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
  });
  return usuarios.map((u) => ({
    id: u.id,
    nombreUsuario: u.nombreUsuario,
    nombre: u.nombre,
    apellido: u.apellido,
    rol: u.rol.nombre,
    registrado: u.datoBiometrico !== null,
    actualizadoEn: u.datoBiometrico?.actualizadoEn ?? null,
  }));
}

export async function estadoBiometrico(usuarioId: number) {
  const u = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { rol: true, datoBiometrico: { select: { actualizadoEn: true } } },
  });
  if (!u) throw noEncontrado('El usuario no existe');
  return {
    usuarioId,
    nombreUsuario: u.nombreUsuario,
    nombre: u.nombre,
    apellido: u.apellido,
    rol: u.rol.nombre,
    registrado: u.datoBiometrico !== null,
    actualizadoEn: u.datoBiometrico?.actualizadoEn ?? null,
  };
}

/** Registra (CU07) o actualiza (CU08) el patrón y la foto de referencia del usuario. */
export async function guardarBiometria(
  usuarioId: number,
  datos: z.infer<typeof esquemaRegistroBiometrico>,
  actorId: number,
) {
  await usuarioExistente(usuarioId);
  const [, tipo, base64] = DATA_URL.exec(datos.foto)!;
  const cifrado = cifrarDatoBiometrico(usuarioId, datos.patron, Buffer.from(base64!, 'base64'));
  const campos = { ...cifrado, fotoTipo: tipo!, registradoPorId: actorId };

  return prisma.$transaction(async (tx) => {
    const existente = await tx.datoBiometrico.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    const dato = await tx.datoBiometrico.upsert({
      where: { usuarioId },
      create: { usuarioId, ...campos },
      update: campos,
      select: { actualizadoEn: true },
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: existente ? 'ACTUALIZAR_BIOMETRIA' : 'REGISTRAR_BIOMETRIA',
      entidad: 'DatoBiometrico',
      entidadId: usuarioId,
      detalle: `Patrón facial y foto de referencia del usuario ${usuarioId}`,
    });
    return { usuarioId, registrado: true, actualizadoEn: dato.actualizadoEn };
  });
}

/** Foto de referencia descifrada en memoria, solo para el administrador (biometria.gestionar). */
export async function fotoDeReferencia(usuarioId: number) {
  const dato = await prisma.datoBiometrico.findUnique({
    where: { usuarioId },
    select: { fotoCifrada: true, fotoTipo: true },
  });
  if (!dato) throw noEncontrado('El usuario no tiene foto de referencia registrada');
  const foto = leerDatoBiometrico(usuarioId, () => descifrarFoto(usuarioId, dato.fotoCifrada));
  return { foto, tipo: dato.fotoTipo };
}

/** Elimina los datos biométricos (CU09). Es el único borrado físico del sistema: dato sensible. */
export async function eliminarBiometria(usuarioId: number, actorId: number) {
  await usuarioExistente(usuarioId);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.datoBiometrico.deleteMany({ where: { usuarioId } });
    if (count === 0) throw noEncontrado('El usuario no tiene datos biométricos registrados');
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'ELIMINAR_BIOMETRIA',
      entidad: 'DatoBiometrico',
      entidadId: usuarioId,
    });
    return { usuarioId, registrado: false, actualizadoEn: null };
  });
}
