import type { EstadoPrescripcion, Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { prisma, type ClienteDb } from '../../db';
import { cambios, registrarAuditoria } from '../auditoria/auditoria.servicio';
import { esperarCandadoDelCiclo } from '../recordatorios/ciclo.servicio';
import { avisarCambioRecordatorios } from '../tiempo-real/bus';
import {
  anclaAlReanudar,
  anclaPorCambioDeFrecuencia,
  esTomaDeLaAgenda,
  proximaTomaPendiente,
  tomasDadas,
  tomasEntre,
} from './agenda';
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
    /** Desde dónde se cuentan las tomas (D112). */
    agendaDesde: p.agendaDesde,
    fechaFin: p.fechaFin,
    observaciones: p.observaciones,
    estado: p.estado,
    motivoCambioEstado: p.motivoCambioEstado,
    prescriptor: nombreDe(p.prescriptor),
    creadoEn: p.creadoEn,
    proximaToma: proximaTomaPendiente(
      p,
      ahora,
      p.suministros.map((s) => s.tomaProgramada),
    ),
    ultimasAdministraciones: p.suministros.map((s) => ({
      id: s.id,
      fechaHora: s.fechaHora,
      /** La toma para la que se dio, guardada al registrarla (D121). */
      tomaProgramada: s.tomaProgramada,
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

/**
 * D122: al volver a anclar la agenda (reanudar o cambiar la frecuencia), los recordatorios
 * vencidos de tomas que ya no están en la agenda nueva se cancelan (conservan `vencidoEn`, como
 * D28 de los estudios): ninguna administración los atendería y quedarían en el panel. Cada uno
 * queda en la auditoría. Devuelve cuántos canceló.
 */
async function cancelarVencidosDeOtraAgenda(
  tx: Prisma.TransactionClient,
  p: PrescripcionCompleta,
  actorId: number,
) {
  const vencidos = await tx.recordatorio.findMany({
    where: { prescripcionId: p.id, estado: 'VENCIDO' },
  });
  let cancelados = 0;
  for (const r of vencidos.filter((v) => !esTomaDeLaAgenda(p, v.fechaHoraObjetivo))) {
    const { count } = await tx.recordatorio.updateMany({
      where: { id: r.id, estado: 'VENCIDO' },
      data: { estado: 'CANCELADO' },
    });
    if (count === 0) continue;
    cancelados++;
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: 'CANCELAR',
      entidad: 'Recordatorio',
      entidadId: r.id,
      pacienteId: p.pacienteId,
      anterior: { estado: 'VENCIDO' },
      nuevo: { estado: 'CANCELADO' },
      detalle:
        'La toma ya no está en la agenda de la prescripción (se reanudó o cambió la frecuencia)',
    });
  }
  return cancelados;
}

/**
 * D121: bloquea la prescripción al empezar la transacción, antes de leerla. Las
 * administraciones y los cambios de agenda de una misma prescripción van de a uno y cada uno lee
 * lo que el otro confirmó. FOR NO KEY UPDATE no choca con el FOR KEY SHARE de los recordatorios
 * que inserta el ciclo.
 */
export async function bloquearPrescripcion(tx: Prisma.TransactionClient, id: number) {
  await tx.$queryRaw`SELECT 1 FROM prescripciones WHERE id = ${id} FOR NO KEY UPDATE`;
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

/**
 * Detalle con las tomas de las próximas 24 h: empiezan por la próxima toma (la que falta dar,
 * aunque sea de hace unos minutos) y no incluyen las que ya se dieron.
 */
export async function obtenerPrescripcion(id: number) {
  const p = await obtenerDb(prisma, id);
  const ahora = reloj.ahora();
  const dto = aDtoPrescripcion(p, ahora);
  const dadas = tomasDadas(p.suministros.map((s) => s.tomaProgramada));
  const agenda = dto.proximaToma
    ? tomasEntre(p, dto.proximaToma, new Date(ahora.getTime() + 24 * 3_600_000)).filter(
        (toma) => !dadas.has(toma.getTime()),
      )
    : [];
  return { ...dto, agenda };
}

export async function crearPrescripcion(
  pacienteId: number,
  datos: AltaPrescripcion,
  actorId: number,
) {
  return prisma.$transaction(async (tx) => {
    await pacienteInternado(tx, pacienteId);
    // D116: un cambio de tipo en curso termina antes de leer el tipo (y no al revés).
    await tx.$queryRaw`SELECT 1 FROM insumos WHERE id = ${datos.insumoId} FOR SHARE`;
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
        agendaDesde: new Date(fechaInicio),
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
    // D30: no cruzarse con un ciclo que está generando un recordatorio de esta prescripción.
    await esperarCandadoDelCiclo(tx);
    // D121: ni con una administración en curso (el ancla tiene que ver su dosis).
    await bloquearPrescripcion(tx, id);
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
    const cambiaFrecuencia =
      datos.frecuenciaHoras !== undefined && datos.frecuenciaHoras !== antes.frecuenciaHoras;
    const despues = await tx.prescripcion.update({
      where: { id },
      data: {
        ...datos,
        ...(nuevaFin !== undefined ? { fechaFin: nuevaFin } : {}),
        // D112 · D122: la próxima toma se cuenta desde la última dosis dada (o desde ahora).
        ...(cambiaFrecuencia ? { agendaDesde: await anclaAlCambiarFrecuencia(tx, antes) } : {}),
      },
      include: incluir,
    });
    const { anterior, nuevo } = cambios(conAncla(antes), conAncla(despues));
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
    const pendientes =
      'frecuenciaHoras' in nuevo || 'fechaFin' in nuevo
        ? await cancelarRecordatoriosPendientes(tx, id, antes.pacienteId, actorId)
        : 0;
    const vencidos = cambiaFrecuencia
      ? await cancelarVencidosDeOtraAgenda(tx, despues, actorId)
      : 0;
    return { dto: aDtoPrescripcion(despues), cancelados: pendientes + vencidos };
  });
  return avisarSiCancelo(resultado);
}

/** La auditoría de un cambio que puede mover la agenda incluye el ancla (D112). */
const conAncla = (p: PrescripcionCompleta) => ({
  ...paraAuditoria(p),
  agendaDesde: p.agendaDesde,
});

/**
 * D112 · D122: la toma de la última dosis dada en la agenda vigente (la guardada al registrarla,
 * D121); si no hay o quedó alguna toma sin dar después, ahora.
 */
async function anclaAlCambiarFrecuencia(tx: Prisma.TransactionClient, p: PrescripcionCompleta) {
  const ultima = await tx.suministro.findFirst({
    where: { prescripcionId: p.id, tipo: 'MEDICAMENTO', tomaProgramada: { gte: p.agendaDesde } },
    orderBy: { tomaProgramada: 'desc' },
    select: { tomaProgramada: true },
  });
  return anclaPorCambioDeFrecuencia(p, reloj.ahora(), ultima?.tomaProgramada ?? null);
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
    await esperarCandadoDelCiclo(tx); // D30
    await bloquearPrescripcion(tx, id); // D121
    const antes = await obtenerDb(tx, id);
    const accion = TRANSICIONES[antes.estado][estado];
    if (!accion) {
      throw conflicto(
        'TRANSICION_INVALIDA',
        `Una prescripción ${antes.estado.toLowerCase()} no puede pasar a ${estado.toLowerCase()}`,
      );
    }
    if (estado === 'VIGENTE') await pacienteInternado(tx, antes.pacienteId);

    // D112: al reanudar, las tomas vuelven a empezar desde ahora.
    const reanuda = accion === 'REANUDAR';
    const despues = await tx.prescripcion.update({
      where: { id },
      data: {
        estado,
        motivoCambioEstado: motivo,
        ...(reanuda ? { agendaDesde: anclaAlReanudar(antes, reloj.ahora()) } : {}),
      },
      include: incluir,
    });
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion,
      entidad: 'Prescripcion',
      entidadId: id,
      pacienteId: antes.pacienteId,
      anterior: { estado: antes.estado, ...(reanuda ? { agendaDesde: antes.agendaDesde } : {}) },
      nuevo: {
        estado,
        motivoCambioEstado: motivo,
        ...(reanuda ? { agendaDesde: despues.agendaDesde } : {}),
      },
    });
    const pendientes =
      antes.estado === 'VIGENTE'
        ? await cancelarRecordatoriosPendientes(tx, id, antes.pacienteId, actorId)
        : 0;
    // D122: los vencidos de antes de suspender ya no son de la agenda nueva.
    const vencidos = reanuda ? await cancelarVencidosDeOtraAgenda(tx, despues, actorId) : 0;
    return { dto: aDtoPrescripcion(despues), cancelados: pendientes + vencidos };
  });
  return avisarSiCancelo(resultado);
}
