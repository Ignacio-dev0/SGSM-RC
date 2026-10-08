import { conflicto, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { asignacionActiva, asignarCama, liberarCama } from '../camas/camas.servicio';
import { esperarCandadoDelCiclo } from '../recordatorios/ciclo.servicio';
import { avisarCambioRecordatorios } from '../tiempo-real/bus';
import { aDtoPaciente, obtenerPacienteDb } from './pacientes.servicio';

const noInternado = () => conflicto('PACIENTE_NO_INTERNADO', 'El paciente no está internado');

/** Traslado de cama (CU15 · T207): cierra la asignación actual y abre la nueva. */
export async function trasladarPaciente(id: number, camaId: number, actorId: number) {
  return prisma.$transaction(async (tx) => {
    const paciente = await obtenerPacienteDb(tx, id);
    if (paciente.estado !== 'INTERNADO') throw noInternado();
    const actual = await asignacionActiva(tx, id);
    if (actual?.camaId === camaId) {
      throw reglaNegocio('MISMA_CAMA', 'El paciente ya está en esa cama');
    }

    await liberarCama(tx, { pacienteId: id, usuarioId: actorId });
    await asignarCama(tx, { pacienteId: id, camaId, motivo: 'TRASLADO', usuarioId: actorId });
    const nueva = await asignacionActiva(tx, id);
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'TRASLADAR',
      entidad: 'Paciente',
      entidadId: id,
      pacienteId: id,
      anterior: { cama: actual ? `${actual.cama.sala.nombre} · ${actual.cama.numero}` : null },
      nuevo: { cama: nueva ? `${nueva.cama.sala.nombre} · ${nueva.cama.numero}` : null },
    });
    return aDtoPaciente(paciente, nueva);
  });
}

/**
 * Egreso del paciente (CU14 · T202) con sus efectos (T210): libera la cama, suspende las
 * prescripciones vigentes y cancela los estudios y recordatorios pendientes. Todo en una sola
 * transacción y auditado; si canceló recordatorios, avisa al tiempo real después del commit.
 */
export async function egresarPaciente(
  id: number,
  datos: { motivo: string; fechaEgreso?: string | undefined },
  actorId: number,
) {
  const { dto, cancelados } = await prisma.$transaction(async (tx) => {
    // D30: si un ciclo está generando recordatorios de este paciente, se espera y se cancelan.
    await esperarCandadoDelCiclo(tx);
    const paciente = await obtenerPacienteDb(tx, id);
    if (paciente.estado !== 'INTERNADO') throw noInternado();

    const fechaEgreso = datos.fechaEgreso ? new Date(datos.fechaEgreso) : reloj.ahora();
    if (fechaEgreso < paciente.fechaIngreso || fechaEgreso > reloj.ahora()) {
      throw reglaNegocio(
        'FECHA_EGRESO_INVALIDA',
        'La fecha de egreso debe estar entre el ingreso del paciente y el momento actual',
      );
    }
    const motivoEfectos = `Egreso del paciente: ${datos.motivo}`.slice(0, 255);

    const egresado = await tx.paciente.update({
      where: { id },
      data: { estado: 'EGRESADO', fechaEgreso, motivoEgreso: datos.motivo },
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'EGRESAR',
      entidad: 'Paciente',
      entidadId: id,
      pacienteId: id,
      anterior: { estado: 'INTERNADO' },
      nuevo: { estado: 'EGRESADO', fechaEgreso, motivoEgreso: datos.motivo },
    });
    await liberarCama(tx, { pacienteId: id, usuarioId: actorId, fecha: fechaEgreso });

    const vigentes = await tx.prescripcion.findMany({
      where: { pacienteId: id, estado: 'VIGENTE' },
    });
    for (const p of vigentes) {
      await tx.prescripcion.update({
        where: { id: p.id },
        data: { estado: 'SUSPENDIDA', motivoCambioEstado: motivoEfectos },
      });
      await registrarAuditoria(tx, {
        usuarioId: actorId,
        accion: 'SUSPENDER',
        entidad: 'Prescripcion',
        entidadId: p.id,
        pacienteId: id,
        anterior: { estado: 'VIGENTE' },
        nuevo: { estado: 'SUSPENDIDA', motivoCambioEstado: motivoEfectos },
      });
    }

    const programados = await tx.estudio.findMany({
      where: { pacienteId: id, estado: 'PROGRAMADO' },
    });
    for (const e of programados) {
      await tx.estudio.update({
        where: { id: e.id },
        data: { estado: 'CANCELADO', motivoCancelacion: motivoEfectos },
      });
      await registrarAuditoria(tx, {
        usuarioId: actorId,
        accion: 'CANCELAR',
        entidad: 'Estudio',
        entidadId: e.id,
        pacienteId: id,
        anterior: { estado: 'PROGRAMADO' },
        nuevo: { estado: 'CANCELADO', motivoCancelacion: motivoEfectos },
      });
    }

    const recordatorios = await tx.recordatorio.updateMany({
      where: { pacienteId: id, estado: 'PENDIENTE' },
      data: { estado: 'CANCELADO' },
    });
    if (recordatorios.count > 0) {
      await registrarAuditoria(tx, {
        usuarioId: actorId,
        accion: 'CANCELAR',
        entidad: 'Recordatorio',
        pacienteId: id,
        detalle: `${recordatorios.count} recordatorios pendientes cancelados por el egreso`,
      });
    }

    return { dto: aDtoPaciente(egresado, null), cancelados: recordatorios.count };
  });
  if (cancelados > 0) avisarCambioRecordatorios();
  return dto;
}
