import { Prisma, type MotivoAsignacion } from '@prisma/client';
import { conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { prisma, type ClienteDb } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';

/**
 * Camas y asignaciones (T201 · CU15 · RN02). Una cama está ocupada cuando tiene una asignación
 * sin `fechaHasta`; la base garantiza con índices parciales que haya a lo sumo una por cama y
 * una por paciente.
 */

const incluirCama = {
  sala: true,
  asignaciones: {
    where: { fechaHasta: null },
    include: { paciente: { select: { id: true, apellido: true, nombre: true, dni: true } } },
  },
} satisfies Prisma.CamaInclude;

type CamaConOcupacion = Prisma.CamaGetPayload<{ include: typeof incluirCama }>;

function aDto(c: CamaConOcupacion) {
  const activa = c.asignaciones[0];
  return {
    id: c.id,
    numero: c.numero,
    habilitada: c.habilitada,
    sala: { id: c.sala.id, nombre: c.sala.nombre },
    ocupada: Boolean(activa),
    paciente: activa ? activa.paciente : null,
  };
}

export async function listarCamas(filtros: {
  salaId?: number | undefined;
  estado?: 'libre' | 'ocupada' | undefined;
}) {
  const where: Prisma.CamaWhereInput = {
    ...(filtros.salaId ? { salaId: filtros.salaId } : {}),
    ...(filtros.estado === 'libre'
      ? { habilitada: true, asignaciones: { none: { fechaHasta: null } } }
      : {}),
    ...(filtros.estado === 'ocupada' ? { asignaciones: { some: { fechaHasta: null } } } : {}),
  };
  const camas = await prisma.cama.findMany({
    where,
    include: incluirCama,
    orderBy: [{ sala: { nombre: 'asc' } }, { numero: 'asc' }],
  });
  return camas.map(aDto);
}

export async function listarSalas() {
  const salas = await prisma.sala.findMany({
    where: { activa: true },
    include: {
      camas: {
        select: {
          habilitada: true,
          asignaciones: { where: { fechaHasta: null }, select: { id: true } },
        },
      },
    },
    orderBy: { nombre: 'asc' },
  });
  return salas.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    piso: s.piso,
    camas: s.camas.length,
    libres: s.camas.filter((c) => c.habilitada && c.asignaciones.length === 0).length,
  }));
}

/** Asignación activa del paciente (su cama actual), o null. */
export function asignacionActiva(db: ClienteDb, pacienteId: number) {
  return db.asignacionCama.findFirst({
    where: { pacienteId, fechaHasta: null },
    include: { cama: { include: { sala: true } } },
  });
}

/**
 * Asigna una cama libre al paciente y deja el registro en el historial y en la auditoría.
 * Lanza CAMA_OCUPADA si otro paciente la tiene (también si se la ganan en paralelo: lo frena
 * el índice único parcial de la base).
 */
export async function asignarCama(
  tx: Prisma.TransactionClient,
  datos: { pacienteId: number; camaId: number; motivo: MotivoAsignacion; usuarioId: number },
) {
  const cama = await tx.cama.findUnique({ where: { id: datos.camaId }, include: incluirCama });
  if (!cama) throw noEncontrado('La cama no existe');
  if (!cama.habilitada) {
    throw reglaNegocio('CAMA_NO_HABILITADA', `La cama ${cama.numero} está fuera de servicio`);
  }
  if (cama.asignaciones.length > 0) {
    throw conflicto('CAMA_OCUPADA', `La cama ${cama.numero} ya está ocupada`);
  }

  try {
    const asignacion = await tx.asignacionCama.create({
      data: {
        pacienteId: datos.pacienteId,
        camaId: datos.camaId,
        motivo: datos.motivo,
        fechaDesde: reloj.ahora(),
        asignadoPorId: datos.usuarioId,
      },
    });
    await registrarAuditoria(tx, {
      usuarioId: datos.usuarioId,
      accion: 'ASIGNAR_CAMA',
      entidad: 'AsignacionCama',
      entidadId: asignacion.id,
      pacienteId: datos.pacienteId,
      nuevo: { cama: `${cama.sala.nombre} · ${cama.numero}`, motivo: datos.motivo },
    });
    return asignacion;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw conflicto('CAMA_OCUPADA', `La cama ${cama.numero} ya está ocupada`);
    }
    throw e;
  }
}

/** Cierra la asignación activa del paciente (si tiene) y devuelve la cama liberada. */
export async function liberarCama(
  tx: Prisma.TransactionClient,
  datos: { pacienteId: number; usuarioId: number; fecha?: Date },
) {
  const activa = await asignacionActiva(tx, datos.pacienteId);
  if (!activa) return null;
  await tx.asignacionCama.update({
    where: { id: activa.id },
    data: { fechaHasta: datos.fecha ?? reloj.ahora(), liberadoPorId: datos.usuarioId },
  });
  await registrarAuditoria(tx, {
    usuarioId: datos.usuarioId,
    accion: 'LIBERAR_CAMA',
    entidad: 'AsignacionCama',
    entidadId: activa.id,
    pacienteId: datos.pacienteId,
    anterior: { cama: `${activa.cama.sala.nombre} · ${activa.cama.numero}` },
  });
  return activa.cama;
}
