import type { EstadoRecordatorio, Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { avisarCambioRecordatorios } from '../tiempo-real/bus';
import type { BusquedaRecordatorios } from './recordatorios.esquemas';

/**
 * Panel de recordatorios (T506) y "No se administró" (T507 · S12). La forma de cada recordatorio
 * es el contrato con el frontend: docs/recordatorios.md.
 */

const persona = { select: { id: true, apellido: true, nombre: true } } as const;

export const incluirRecordatorio = {
  paciente: {
    select: {
      id: true,
      apellido: true,
      nombre: true,
      dni: true,
      asignaciones: {
        where: { fechaHasta: null },
        select: {
          cama: { select: { numero: true, sala: { select: { id: true, nombre: true } } } },
        },
      },
    },
  },
  prescripcion: { include: { insumo: true } },
  estudio: { include: { tipoEstudio: true } },
  atendidoPor: persona,
} satisfies Prisma.RecordatorioInclude;

type RecordatorioCompleto = Prisma.RecordatorioGetPayload<{ include: typeof incluirRecordatorio }>;

const nombre = (u: { apellido: string; nombre: string }) => `${u.apellido}, ${u.nombre}`;

export function aDtoRecordatorio(r: RecordatorioCompleto) {
  const { paciente: pa, prescripcion: p, estudio: e } = r;
  return {
    id: r.id,
    tipo: r.tipo,
    estado: r.estado,
    prioridad: r.prioridad,
    fechaHoraObjetivo: r.fechaHoraObjetivo,
    generadoEn: r.generadoEn,
    vencidoEn: r.vencidoEn,
    paciente: { id: pa.id, apellido: pa.apellido, nombre: pa.nombre, dni: pa.dni },
    cama: pa.asignaciones[0]?.cama ?? null,
    prescripcion: p
      ? {
          id: p.id,
          medicamento: p.insumo.nombre,
          presentacion: p.insumo.presentacion,
          dosis: p.dosis,
          unidadDosis: p.unidadDosis,
          via: p.via,
          frecuenciaHoras: p.frecuenciaHoras,
        }
      : null,
    estudio: e
      ? {
          id: e.id,
          nombre: e.nombre,
          tipoEstudio: e.tipoEstudio.nombre,
          preparacion: e.preparacion,
        }
      : null,
    atendidoEn: r.atendidoEn,
    atendidoPor: r.atendidoPor ? { id: r.atendidoPor.id, nombre: nombre(r.atendidoPor) } : null,
    suministroId: r.suministroId,
    motivoNoAdministrado: r.motivoNoAdministrado,
  };
}

export type DtoRecordatorio = ReturnType<typeof aDtoRecordatorio>;

/**
 * Para atender (S13): los pendientes y los vencidos de las últimas 12 h de todo el hospital,
 * solo de pacientes internados (D19), por urgencia: prioridad y después la hora de la toma.
 */
export async function listarRecordatorios({ tipo, salaId }: BusquedaRecordatorios) {
  const ahora = reloj.ahora();
  const visiblesDesde = new Date(
    ahora.getTime() - config.recordatorios.vencidosVisiblesHoras * 3_600_000,
  );
  const lista = await prisma.recordatorio.findMany({
    where: {
      ...(tipo ? { tipo } : {}),
      paciente: {
        estado: 'INTERNADO',
        ...(salaId ? { asignaciones: { some: { fechaHasta: null, cama: { salaId } } } } : {}),
      },
      OR: [{ estado: 'PENDIENTE' }, { estado: 'VENCIDO', vencidoEn: { gte: visiblesDesde } }],
    },
    include: incluirRecordatorio,
    // Los enums se ordenan como se declararon: ALTA, MEDIA, BAJA.
    orderBy: [{ prioridad: 'asc' }, { fechaHoraObjetivo: 'asc' }, { id: 'asc' }],
  });
  const data = lista.map(aDtoRecordatorio);
  return {
    data,
    meta: {
      total: data.length,
      urgentes: data.filter((r) => r.prioridad === 'ALTA' || r.estado === 'VENCIDO').length,
      ahora: ahora.toISOString(),
    },
  };
}

/** Estados en los que un recordatorio todavía se puede atender. */
export const SIN_ATENDER: EstadoRecordatorio[] = ['PENDIENTE', 'VENCIDO'];

const noPendiente = (estado: EstadoRecordatorio) =>
  conflicto(
    'RECORDATORIO_NO_PENDIENTE',
    estado === 'CANCELADO' ? 'El recordatorio fue cancelado' : 'El recordatorio ya fue atendido',
    { estado },
  );

/** "No se administró" (T507 · S12): atiende la toma con el motivo, sin pedir el rostro. */
export async function registrarNoAdministrado(id: number, motivo: string, actorId: number) {
  const dto = await prisma.$transaction(async (tx) => {
    const r = await tx.recordatorio.findUnique({ where: { id } });
    if (!r) throw noEncontrado('El recordatorio no existe');
    if (r.tipo !== 'MEDICAMENTO') {
      throw reglaNegocio(
        'NO_ES_TOMA',
        'Los recordatorios de estudios se atienden confirmando el estudio',
      );
    }
    if (!SIN_ATENDER.includes(r.estado)) throw noPendiente(r.estado);

    const ahora = reloj.ahora();
    // Si otra persona lo atendió en el medio, el WHERE ya no coincide y no se pisa.
    const { count } = await tx.recordatorio.updateMany({
      where: { id, estado: { in: SIN_ATENDER } },
      data: {
        estado: 'ATENDIDO',
        atendidoEn: ahora,
        atendidoPorId: actorId,
        motivoNoAdministrado: motivo,
      },
    });
    if (count === 0) throw noPendiente('ATENDIDO');
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'NO_ADMINISTRAR',
      entidad: 'Recordatorio',
      entidadId: id,
      pacienteId: r.pacienteId,
      anterior: { estado: r.estado },
      nuevo: { estado: 'ATENDIDO', motivoNoAdministrado: motivo },
      detalle: motivo,
    });
    return aDtoRecordatorio(
      await tx.recordatorio.findUniqueOrThrow({ where: { id }, include: incluirRecordatorio }),
    );
  });
  avisarCambioRecordatorios();
  return dto;
}
