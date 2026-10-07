import { prisma } from '../../db';
import { obtenerPacienteDb } from './pacientes.servicio';

const nombreDe = (u: { apellido: string; nombre: string } | null) =>
  u ? `${u.apellido}, ${u.nombre}` : null;

/**
 * Historial del paciente (T209 · CU16 · RF10): asignaciones de cama, modificaciones (desde la
 * auditoría) y suministros, opcionalmente acotados a un rango de fechas. Lo más reciente primero.
 */
export async function historialPaciente(
  id: number,
  rango: { desde?: Date | undefined; hasta?: Date | undefined },
) {
  await obtenerPacienteDb(prisma, id);
  const entre = {
    ...(rango.desde ? { gte: rango.desde } : {}),
    ...(rango.hasta ? { lte: rango.hasta } : {}),
  };
  const usuario = { select: { apellido: true, nombre: true } };

  const [asignaciones, modificaciones, suministros] = await Promise.all([
    prisma.asignacionCama.findMany({
      where: {
        pacienteId: id,
        ...(rango.hasta ? { fechaDesde: { lte: rango.hasta } } : {}),
        ...(rango.desde
          ? { OR: [{ fechaHasta: null }, { fechaHasta: { gte: rango.desde } }] }
          : {}),
      },
      include: { cama: { include: { sala: true } }, asignadoPor: usuario, liberadoPor: usuario },
      orderBy: [{ fechaDesde: 'desc' }, { id: 'desc' }],
    }),
    prisma.auditoria.findMany({
      where: { pacienteId: id, fechaHora: entre },
      include: { usuario },
      orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
    }),
    prisma.suministro.findMany({
      where: { pacienteId: id, fechaHora: entre },
      include: { usuario, detalles: { include: { insumo: true } } },
      orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
    }),
  ]);

  return {
    asignaciones: asignaciones.map((a) => ({
      id: a.id,
      cama: `${a.cama.sala.nombre} · ${a.cama.numero}`,
      motivo: a.motivo,
      fechaDesde: a.fechaDesde,
      fechaHasta: a.fechaHasta,
      asignadoPor: nombreDe(a.asignadoPor),
      liberadoPor: nombreDe(a.liberadoPor),
    })),
    modificaciones: modificaciones.map((m) => ({
      id: m.id,
      fechaHora: m.fechaHora,
      accion: m.accion,
      entidad: m.entidad,
      usuario: nombreDe(m.usuario),
      valorAnterior: m.valorAnterior,
      valorNuevo: m.valorNuevo,
      detalle: m.detalle,
    })),
    suministros: suministros.map((s) => ({
      id: s.id,
      fechaHora: s.fechaHora,
      tipo: s.tipo,
      prescripcionId: s.prescripcionId,
      usuario: nombreDe(s.usuario),
      corregido: s.corregidoEn !== null,
      detalles: s.detalles.map((d) => ({
        insumo: d.insumo.nombre,
        cantidad: d.cantidad,
        unidad: d.insumo.unidadMedida,
      })),
    })),
  };
}
