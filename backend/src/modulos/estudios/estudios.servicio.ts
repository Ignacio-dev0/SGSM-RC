import type { EstadoEstudio, Estudio, Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { prisma, type ClienteDb } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { esperarCandadoDelCiclo } from '../recordatorios/ciclo.servicio';
import { SIN_ATENDER } from '../recordatorios/recordatorios.servicio';
import { avisarCambioRecordatorios } from '../tiempo-real/bus';
import type {
  CancelacionEstudio,
  ProgramacionEstudio,
  ReprogramacionEstudio,
} from './estudios.esquemas';

/**
 * Estudios en versión mínima (T509–T512 · S15): el médico los programa, reprograma o cancela; la
 * confirmación con el rostro está en confirmacion.servicio.ts. El recordatorio de cada estudio lo
 * genera el temporizador (T504 · D31). Contrato con el frontend: docs/estudios.md.
 */

/** D26: un estudio se programa desde 5 min antes de ahora (reloj de la tablet) hasta 90 días. */
const TOLERANCIA_PASADO_MIN = 5;
const MAXIMO_DIAS = 90;

const persona = { select: { id: true, apellido: true, nombre: true } } as const;

export const incluirEstudio = {
  tipoEstudio: true,
  creadoPor: persona,
  confirmadoPor: persona,
} satisfies Prisma.EstudioInclude;

type EstudioCompleto = Prisma.EstudioGetPayload<{ include: typeof incluirEstudio }>;

const quien = (u: { id: number; apellido: string; nombre: string }) => ({
  id: u.id,
  nombre: `${u.apellido}, ${u.nombre}`,
});

export function aDtoEstudio(e: EstudioCompleto) {
  return {
    id: e.id,
    pacienteId: e.pacienteId,
    tipoEstudio: { id: e.tipoEstudio.id, nombre: e.tipoEstudio.nombre },
    nombre: e.nombre,
    fechaHora: e.fechaHora,
    preparacion: e.preparacion,
    observaciones: e.observaciones,
    estado: e.estado,
    motivoCancelacion: e.motivoCancelacion,
    realizadoEn: e.realizadoEn,
    confirmadoPor: e.confirmadoPor ? quien(e.confirmadoPor) : null,
    observacionesRealizacion: e.observacionesRealizacion,
    creadoPor: quien(e.creadoPor),
    creadoEn: e.creadoEn,
  };
}

export type DtoEstudio = ReturnType<typeof aDtoEstudio>;

export async function obtenerEstudioDb(db: ClienteDb, id: number) {
  const e = await db.estudio.findUnique({ where: { id }, include: incluirEstudio });
  if (!e) throw noEncontrado('El estudio no existe');
  return e;
}

/** 409 cuando el estado del estudio no permite la acción (solo se actúa sobre los programados). */
export const noProgramado = (estado: EstadoEstudio) =>
  conflicto(
    'ESTUDIO_NO_PROGRAMADO',
    estado === 'CANCELADO' ? 'El estudio fue cancelado' : 'El estudio ya se realizó',
    { estado },
  );

function verificarFecha(fechaHora: Date) {
  const ahora = reloj.ahora().getTime();
  const desde = ahora - TOLERANCIA_PASADO_MIN * 60_000;
  const hasta = ahora + MAXIMO_DIAS * 24 * 3_600_000;
  if (fechaHora.getTime() < desde || fechaHora.getTime() > hasta) {
    throw reglaNegocio(
      'FECHA_ESTUDIO_INVALIDA',
      `La fecha del estudio tiene que ser futura y dentro de los próximos ${MAXIMO_DIAS} días`,
    );
  }
}

async function pacienteInternado(db: ClienteDb, pacienteId: number) {
  const paciente = await db.paciente.findUnique({ where: { id: pacienteId } });
  if (!paciente) throw noEncontrado('El paciente no existe');
  if (paciente.estado !== 'INTERNADO') {
    throw conflicto('PACIENTE_NO_INTERNADO', 'El paciente no está internado');
  }
}

/**
 * Cancela los recordatorios sin atender del estudio, pendientes y también vencidos (D28): el
 * de la hora vieja ya no se puede atender. Devuelve cuántos canceló: quien llama avisa al tiempo
 * real después del commit.
 */
async function cancelarRecordatoriosDelEstudio(
  tx: Prisma.TransactionClient,
  estudio: Estudio,
  actorId: number,
  detalle: string,
) {
  const activos = await tx.recordatorio.findMany({
    where: { estudioId: estudio.id, estado: { in: SIN_ATENDER } },
  });
  let cancelados = 0;
  for (const r of activos) {
    const { count } = await tx.recordatorio.updateMany({
      where: { id: r.id, estado: { in: SIN_ATENDER } },
      data: { estado: 'CANCELADO' },
    });
    if (count === 0) continue;
    cancelados++;
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'CANCELAR',
      entidad: 'Recordatorio',
      entidadId: r.id,
      pacienteId: estudio.pacienteId,
      anterior: { estado: r.estado },
      nuevo: { estado: 'CANCELADO' },
      detalle,
    });
  }
  return cancelados;
}

/** Tipos de estudio activos, para elegir al programar (T509). */
export async function listarTiposEstudio() {
  const tipos = await prisma.tipoEstudio.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  });
  return tipos.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    preparacionPorDefecto: t.preparacionPorDefecto,
  }));
}

/** Programados primero (el más próximo arriba); después el resto, el más reciente arriba. */
export async function listarEstudiosDePaciente(pacienteId: number, estado?: EstadoEstudio) {
  if (!(await prisma.paciente.findUnique({ where: { id: pacienteId } }))) {
    throw noEncontrado('El paciente no existe');
  }
  const lista = await prisma.estudio.findMany({
    where: { pacienteId, ...(estado ? { estado } : {}) },
    include: incluirEstudio,
    orderBy: [{ fechaHora: 'asc' }, { id: 'asc' }],
  });
  const programados = lista.filter((e) => e.estado === 'PROGRAMADO');
  const resto = lista.filter((e) => e.estado !== 'PROGRAMADO').reverse();
  return [...programados, ...resto].map(aDtoEstudio);
}

export async function obtenerEstudio(id: number) {
  return aDtoEstudio(await obtenerEstudioDb(prisma, id));
}

/** El médico programa un estudio a un paciente internado (T511 · S15). */
export async function programarEstudio(
  pacienteId: number,
  datos: ProgramacionEstudio,
  actorId: number,
) {
  return prisma.$transaction(async (tx) => {
    await pacienteInternado(tx, pacienteId);
    const tipo = await tx.tipoEstudio.findUnique({ where: { id: datos.tipoEstudioId } });
    if (!tipo) throw noEncontrado('El tipo de estudio no existe');
    if (!tipo.activo) {
      throw reglaNegocio(
        'TIPO_ESTUDIO_NO_DISPONIBLE',
        `${tipo.nombre} está dado de baja en el catálogo`,
      );
    }
    const fechaHora = new Date(datos.fechaHora);
    verificarFecha(fechaHora);

    const creado = await tx.estudio.create({
      data: {
        pacienteId,
        tipoEstudioId: tipo.id,
        // D27: sin nombre ni preparación, los del tipo; una preparación null queda sin preparación.
        nombre: datos.nombre ?? tipo.nombre,
        fechaHora,
        preparacion:
          datos.preparacion === undefined ? tipo.preparacionPorDefecto : datos.preparacion,
        observaciones: datos.observaciones,
        creadoPorId: actorId,
      },
      include: incluirEstudio,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'PROGRAMAR',
      entidad: 'Estudio',
      entidadId: creado.id,
      pacienteId,
      nuevo: {
        tipoEstudio: tipo.nombre,
        nombre: creado.nombre,
        fechaHora: creado.fechaHora,
        preparacion: creado.preparacion,
        observaciones: creado.observaciones,
      },
    });
    return aDtoEstudio(creado);
  });
}

/** Cambia la hora de un estudio programado y cancela el recordatorio de la hora vieja (T512). */
export async function reprogramarEstudio(
  id: number,
  datos: ReprogramacionEstudio,
  actorId: number,
) {
  const { dto, cancelados } = await prisma.$transaction(async (tx) => {
    await esperarCandadoDelCiclo(tx);
    const antes = await obtenerEstudioDb(tx, id);
    if (antes.estado !== 'PROGRAMADO') throw noProgramado(antes.estado);
    const fechaHora = new Date(datos.fechaHora);
    if (fechaHora.getTime() === antes.fechaHora.getTime()) {
      throw reglaNegocio('SIN_CAMBIOS', 'El estudio ya está programado para esa fecha y hora');
    }
    verificarFecha(fechaHora);

    const despues = await tx.estudio.update({
      where: { id },
      data: { fechaHora },
      include: incluirEstudio,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'REPROGRAMAR',
      entidad: 'Estudio',
      entidadId: id,
      pacienteId: antes.pacienteId,
      anterior: { fechaHora: antes.fechaHora },
      nuevo: { fechaHora },
    });
    const cancelados = await cancelarRecordatoriosDelEstudio(
      tx,
      antes,
      actorId,
      'Estudio reprogramado',
    );
    return { dto: aDtoEstudio(despues), cancelados };
  });
  if (cancelados > 0) avisarCambioRecordatorios();
  return dto;
}

/** Cancela un estudio programado con su motivo, y sus recordatorios (T512). */
export async function cancelarEstudio(id: number, { motivo }: CancelacionEstudio, actorId: number) {
  const { dto, cancelados } = await prisma.$transaction(async (tx) => {
    await esperarCandadoDelCiclo(tx);
    const antes = await obtenerEstudioDb(tx, id);
    if (antes.estado !== 'PROGRAMADO') throw noProgramado(antes.estado);

    const despues = await tx.estudio.update({
      where: { id },
      data: { estado: 'CANCELADO', motivoCancelacion: motivo },
      include: incluirEstudio,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'CANCELAR',
      entidad: 'Estudio',
      entidadId: id,
      pacienteId: antes.pacienteId,
      anterior: { estado: 'PROGRAMADO' },
      nuevo: { estado: 'CANCELADO', motivoCancelacion: motivo },
      detalle: motivo,
    });
    const cancelados = await cancelarRecordatoriosDelEstudio(
      tx,
      antes,
      actorId,
      `Estudio cancelado: ${motivo}`.slice(0, 255),
    );
    return { dto: aDtoEstudio(despues), cancelados };
  });
  if (cancelados > 0) avisarCambioRecordatorios();
  return dto;
}
