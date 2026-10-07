import type { EstadoPrescripcion, Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { prisma, type ClienteDb } from '../../db';
import { cambios, registrarAuditoria } from '../auditoria/auditoria.servicio';
import { avisarCambioRecordatorios } from '../tiempo-real/bus';
import { proximaTomaPendiente, tomasEntre } from './agenda';
import type { AltaPrescripcion, ModificacionPrescripcion } from './prescripciones.esquemas';

/**
 * Prescripciones médicas (T301 · T307 · CU17–CU19). Son la base de los recordatorios (E5) y la
 * condición para registrar una administración (RN07, E4).
 */

const usuario = { select: { apellido: true, nombre: true } } as const;

const incluir = {
  insumo: true,
  prescriptor: usuario,
  suministros: {
    orderBy: { fechaHora: 'desc' },
    take: 3,
    include: { usuario, detalles: true },
  },
} satisfies Prisma.PrescripcionInclude;

type PrescripcionCompleta = Prisma.PrescripcionGetPayload<{ include: typeof incluir }>;

const nombreDe = (u: { apellido: string; nombre: string }) => `${u.apellido}, ${u.nombre}`;

export function aDtoPrescripcion(p: PrescripcionCompleta, ahora = reloj.ahora()) {
  return {
    id: p.id,
    pacienteId: p.pacienteId,
    medicamento: {
      id: p.insumo.id,
      nombre: p.insumo.nombre,
      presentacion: p.insumo.presentacion,
      unidadMedida: p.insumo.unidadMedida,
    },
    dosis: p.dosis,
    unidadDosis: p.unidadDosis,
    frecuenciaHoras: p.frecuenciaHoras,
    via: p.via,
    fechaInicio: p.fechaInicio,
    fechaFin: p.fechaFin,
    observaciones: p.observaciones,
    estado: p.estado,
    motivoCambioEstado: p.motivoCambioEstado,
    prescriptor: nombreDe(p.prescriptor),
    creadoEn: p.creadoEn,
    proximaToma: proximaTomaPendiente(
      p,
      ahora,
      p.suministros.map((s) => s.fechaHora),
    ),
    ultimasAdministraciones: p.suministros.map((s) => ({
      id: s.id,
      fechaHora: s.fechaHora,
      cantidad: s.detalles[0]?.cantidad ?? null,
      usuario: nombreDe(s.usuario),
    })),
  };
}

/** Campos que se comparan en la auditoría. */
const paraAuditoria = (p: PrescripcionCompleta) => ({
  medicamento: `${p.insumo.nombre} ${p.insumo.presentacion}`.trim(),
  dosis: p.dosis,
  unidadDosis: p.unidadDosis,
  frecuenciaHoras: p.frecuenciaHoras,
  via: p.via,
  fechaInicio: p.fechaInicio,
  fechaFin: p.fechaFin,
  observaciones: p.observaciones,
  estado: p.estado,
});

async function obtenerDb(db: ClienteDb, id: number) {
  const p = await db.prescripcion.findUnique({ where: { id }, include: incluir });
  if (!p) throw noEncontrado('La prescripción no existe');
  return p;
}

async function pacienteInternado(db: ClienteDb, pacienteId: number) {
  const paciente = await db.paciente.findUnique({ where: { id: pacienteId } });
  if (!paciente) throw noEncontrado('El paciente no existe');
  if (paciente.estado !== 'INTERNADO') {
    throw conflicto('PACIENTE_NO_INTERNADO', 'El paciente no está internado');
  }
  return paciente;
}

/**
 * Los recordatorios pendientes de una prescripción que cambió dejan de tener sentido (E5).
 * Devuelve cuántos canceló: quien llama avisa al tiempo real después del commit.
 */
async function cancelarRecordatoriosPendientes(
  tx: Prisma.TransactionClient,
  prescripcionId: number,
  pacienteId: number,
  actorId: number,
) {
  const { count } = await tx.recordatorio.updateMany({
    where: { prescripcionId, estado: 'PENDIENTE' },
    data: { estado: 'CANCELADO' },
  });
  if (count > 0) {
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'CANCELAR',
      entidad: 'Recordatorio',
      pacienteId,
      detalle: `${count} recordatorios pendientes de la prescripción ${prescripcionId}`,
    });
  }
  return count;
}

/** Avisa al tiempo real si la transacción (ya confirmada) canceló recordatorios. */
function avisarSiCancelo<T>({ dto, cancelados }: { dto: T; cancelados: number }): T {
  if (cancelados > 0) avisarCambioRecordatorios();
  return dto;
}

export async function listarPrescripcionesDePaciente(
  pacienteId: number,
  estado?: EstadoPrescripcion,
) {
  if (!(await prisma.paciente.findUnique({ where: { id: pacienteId } }))) {
    throw noEncontrado('El paciente no existe');
  }
  const ahora = reloj.ahora();
  const lista = await prisma.prescripcion.findMany({
    where: { pacienteId, ...(estado ? { estado } : {}) },
    include: incluir,
    // Los enums de PostgreSQL se ordenan como se declararon: VIGENTE, SUSPENDIDA, FINALIZADA.
    orderBy: [{ estado: 'asc' }, { fechaInicio: 'desc' }, { id: 'desc' }],
  });
  return lista.map((p) => aDtoPrescripcion(p, ahora));
}

export async function obtenerPrescripcion(id: number) {
  const p = await obtenerDb(prisma, id);
  const ahora = reloj.ahora();
  const agenda =
    p.estado === 'VIGENTE' ? tomasEntre(p, ahora, new Date(ahora.getTime() + 24 * 3_600_000)) : [];
  return { ...aDtoPrescripcion(p, ahora), agenda };
}

export async function crearPrescripcion(
  pacienteId: number,
  datos: AltaPrescripcion,
  actorId: number,
) {
  return prisma.$transaction(async (tx) => {
    await pacienteInternado(tx, pacienteId);
    const insumo = await tx.insumo.findUnique({ where: { id: datos.insumoId } });
    if (!insumo) throw noEncontrado('El medicamento no existe');
    if (insumo.tipo !== 'MEDICAMENTO') {
      throw reglaNegocio('NO_ES_MEDICAMENTO', `${insumo.nombre} es un insumo, no un medicamento`);
    }
    if (!insumo.activo) {
      throw reglaNegocio(
        'MEDICAMENTO_NO_DISPONIBLE',
        `${insumo.nombre} está dado de baja en el catálogo`,
      );
    }

    // T307: advertir si ya hay otra vigente del mismo medicamento; el usuario decide.
    const vigentes = await tx.prescripcion.findMany({
      where: { pacienteId, insumoId: datos.insumoId, estado: 'VIGENTE' },
    });
    if (vigentes.length > 0 && !datos.confirmarDuplicada) {
      throw conflicto(
        'PRESCRIPCION_DUPLICADA',
        `El paciente ya tiene una prescripción vigente de ${insumo.nombre}`,
        {
          prescripciones: vigentes.map((v) => ({
            id: v.id,
            dosis: v.dosis,
            unidadDosis: v.unidadDosis,
            frecuenciaHoras: v.frecuenciaHoras,
            via: v.via,
            fechaInicio: v.fechaInicio,
          })),
        },
      );
    }

    const { confirmarDuplicada: _c, fechaInicio, fechaFin, ...resto } = datos;
    const creada = await tx.prescripcion.create({
      data: {
        ...resto,
        pacienteId,
        fechaInicio: new Date(fechaInicio),
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        prescriptorId: actorId,
      },
      include: incluir,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'CREAR',
      entidad: 'Prescripcion',
      entidadId: creada.id,
      pacienteId,
      nuevo: paraAuditoria(creada),
      detalle:
        vigentes.length > 0
          ? 'Confirmada por el usuario aunque había otra vigente del mismo medicamento (duplicada)'
          : null,
    });
    return aDtoPrescripcion(creada);
  });
}

export async function modificarPrescripcion(
  id: number,
  { motivo, fechaFin, ...datos }: ModificacionPrescripcion,
  actorId: number,
) {
  const resultado = await prisma.$transaction(async (tx) => {
    const antes = await obtenerDb(tx, id);
    if (antes.estado !== 'VIGENTE') {
      throw conflicto(
        'PRESCRIPCION_NO_VIGENTE',
        'Solo se puede modificar una prescripción vigente',
      );
    }
    const nuevaFin = fechaFin === undefined ? undefined : fechaFin ? new Date(fechaFin) : null;
    if (nuevaFin && nuevaFin <= antes.fechaInicio) {
      throw reglaNegocio('FECHA_FIN_INVALIDA', 'La fecha de fin debe ser posterior al inicio');
    }
    const despues = await tx.prescripcion.update({
      where: { id },
      data: { ...datos, ...(nuevaFin !== undefined ? { fechaFin: nuevaFin } : {}) },
      include: incluir,
    });
    const { anterior, nuevo } = cambios(paraAuditoria(antes), paraAuditoria(despues));
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'MODIFICAR',
      entidad: 'Prescripcion',
      entidadId: id,
      pacienteId: antes.pacienteId,
      anterior,
      nuevo,
      detalle: motivo,
    });
    const cancelados =
      'frecuenciaHoras' in nuevo || 'fechaFin' in nuevo
        ? await cancelarRecordatoriosPendientes(tx, id, antes.pacienteId, actorId)
        : 0;
    return { dto: aDtoPrescripcion(despues), cancelados };
  });
  return avisarSiCancelo(resultado);
}

/** Transiciones permitidas y la acción que queda en la auditoría. */
const TRANSICIONES: Record<EstadoPrescripcion, Partial<Record<EstadoPrescripcion, string>>> = {
  VIGENTE: { SUSPENDIDA: 'SUSPENDER', FINALIZADA: 'FINALIZAR' },
  SUSPENDIDA: { VIGENTE: 'REANUDAR', FINALIZADA: 'FINALIZAR' },
  FINALIZADA: {},
};

export async function cambiarEstadoPrescripcion(
  id: number,
  { estado, motivo }: { estado: EstadoPrescripcion; motivo: string },
  actorId: number,
) {
  const resultado = await prisma.$transaction(async (tx) => {
    const antes = await obtenerDb(tx, id);
    const accion = TRANSICIONES[antes.estado][estado];
    if (!accion) {
      throw conflicto(
        'TRANSICION_INVALIDA',
        `Una prescripción ${antes.estado.toLowerCase()} no puede pasar a ${estado.toLowerCase()}`,
      );
    }
    if (estado === 'VIGENTE') await pacienteInternado(tx, antes.pacienteId);

    const despues = await tx.prescripcion.update({
      where: { id },
      data: { estado, motivoCambioEstado: motivo },
      include: incluir,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion,
      entidad: 'Prescripcion',
      entidadId: id,
      pacienteId: antes.pacienteId,
      anterior: { estado: antes.estado },
      nuevo: { estado, motivoCambioEstado: motivo },
    });
    const cancelados =
      antes.estado === 'VIGENTE'
        ? await cancelarRecordatoriosPendientes(tx, id, antes.pacienteId, actorId)
        : 0;
    return { dto: aDtoPrescripcion(despues), cancelados };
  });
  return avisarSiCancelo(resultado);
}
