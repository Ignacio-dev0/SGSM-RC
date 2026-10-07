import type { Prisma, PrioridadRecordatorio } from '@prisma/client';
import { horaArgentina } from '../../comun/fechas';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { notificarAdministradores } from '../notificaciones/notificaciones.servicio';
import { avisarCambioRecordatorios } from '../tiempo-real/bus';
import { tomasParaRecordar, ventanaDeGeneracion } from './generacion';
import { prioridadDe } from './prioridad';

/**
 * Un ciclo del temporizador de recordatorios (T501–T503 · T508): vence los atrasados (y avisa a
 * los administradores), genera los de las tomas que se acercan y recalcula la prioridad de los
 * pendientes. Todo en una transacción con un candado de PostgreSQL, para que dos procesos (o dos
 * ciclos superpuestos) no hagan el mismo trabajo; el índice único parcial es la última barrera
 * contra duplicados. El aviso al tiempo real sale DESPUÉS del commit.
 */

/** Número del candado de PostgreSQL (pg_try_advisory_xact_lock) del ciclo de recordatorios. */
const CANDADO_DEL_CICLO = 50_501;

/** Mitad de la frecuencia máxima (168 h): más atrás, una administración ya no es de estas tomas. */
const MEDIA_FRECUENCIA_MAXIMA = 84 * 3_600_000;

type Tx = Prisma.TransactionClient;

export interface ResultadoCiclo {
  /** false si otro proceso tenía el candado y este ciclo no hizo nada. */
  ejecutado: boolean;
  nuevos: number;
  vencidos: number;
  repriorizados: number;
}

export async function ejecutarCiclo(ahora = reloj.ahora()): Promise<ResultadoCiclo> {
  const resultado = await prisma.$transaction(
    async (tx) => {
      const [candado] = await tx.$queryRaw<{ obtenido: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${CANDADO_DEL_CICLO}::bigint) AS obtenido`;
      if (!candado?.obtenido) return null;
      const vencidos = await vencerAtrasados(tx, ahora);
      const nuevos = await generar(tx, ahora);
      const repriorizados = await repriorizar(tx, ahora);
      return { nuevos, vencidos, repriorizados };
    },
    { timeout: 30_000 },
  );
  if (!resultado) return { ejecutado: false, nuevos: 0, vencidos: 0, repriorizados: 0 };
  const { nuevos, vencidos, repriorizados } = resultado;
  if (nuevos + vencidos + repriorizados > 0) avisarCambioRecordatorios({ nuevos, vencidos });
  return { ejecutado: true, ...resultado };
}

const incluirParaAviso = {
  paciente: {
    select: {
      apellido: true,
      nombre: true,
      asignaciones: { where: { fechaHasta: null }, select: { cama: true } },
    },
  },
  prescripcion: { include: { insumo: true } },
  estudio: true,
} satisfies Prisma.RecordatorioInclude;

type RecordatorioParaAviso = Prisma.RecordatorioGetPayload<{ include: typeof incluirParaAviso }>;

/** "Recordatorio vencido sin atender: Paracetamol de las 05:00 · Benítez, Rosa (cama A-01)". */
function mensajeDeVencido(r: RecordatorioParaAviso) {
  const que = r.prescripcion
    ? r.prescripcion.insumo.nombre
    : `estudio ${r.estudio?.nombre ?? ''}`.trim();
  const cama = r.paciente.asignaciones[0]?.cama.numero;
  const quien = `${r.paciente.apellido}, ${r.paciente.nombre}${cama ? ` (cama ${cama})` : ''}`;
  const hora = horaArgentina(r.fechaHoraObjetivo);
  return `Recordatorio vencido sin atender: ${que} de las ${hora} · ${quien}`.slice(0, 255);
}

/** T503 · S11: a los 60 min de generado sin atenderse, VENCIDO y aviso a los administradores. */
async function vencerAtrasados(tx: Tx, ahora: Date) {
  const limite = new Date(ahora.getTime() - config.recordatorios.vencimientoMinutos * 60_000);
  const atrasados = await tx.recordatorio.findMany({
    where: { estado: 'PENDIENTE', generadoEn: { lte: limite } },
    include: incluirParaAviso,
    orderBy: { id: 'asc' },
  });

  let vencidos = 0;
  for (const r of atrasados) {
    // Si en el medio se atendió, no se pisa (el WHERE se reevalúa tras el bloqueo de la fila).
    const { count } = await tx.recordatorio.updateMany({
      where: { id: r.id, estado: 'PENDIENTE' },
      data: {
        estado: 'VENCIDO',
        vencidoEn: ahora,
        prioridad: prioridadDe(r.tipo, r.fechaHoraObjetivo, ahora),
      },
    });
    if (count === 0) continue;
    vencidos++;
    await registrarAuditoria(tx, {
      accion: 'VENCER',
      entidad: 'Recordatorio',
      entidadId: r.id,
      pacienteId: r.pacienteId,
      anterior: { estado: 'PENDIENTE' },
      nuevo: { estado: 'VENCIDO', vencidoEn: ahora },
    });
    await notificarAdministradores(tx, {
      tipo: 'RECORDATORIO_VENCIDO',
      mensaje: mensajeDeVencido(r),
      datos: {
        recordatorioId: r.id,
        pacienteId: r.pacienteId,
        fechaHoraObjetivo: r.fechaHoraObjetivo.toISOString(),
      },
    });
  }
  return vencidos;
}

/** T502: un recordatorio por cada toma de la ventana que no tenga administración ni recordatorio. */
async function generar(tx: Tx, ahora: Date) {
  const { desde, hasta } = ventanaDeGeneracion(ahora);
  const prescripciones = await tx.prescripcion.findMany({
    where: {
      estado: 'VIGENTE',
      paciente: { estado: 'INTERNADO' },
      fechaInicio: { lte: hasta },
      OR: [{ fechaFin: null }, { fechaFin: { gte: desde } }],
    },
    select: {
      id: true,
      pacienteId: true,
      fechaInicio: true,
      frecuenciaHoras: true,
      fechaFin: true,
      suministros: {
        where: { fechaHora: { gte: new Date(desde.getTime() - MEDIA_FRECUENCIA_MAXIMA) } },
        select: { fechaHora: true },
      },
    },
  });
  const tomas = tomasParaRecordar(
    prescripciones.map((p) => ({ ...p, administraciones: p.suministros.map((s) => s.fechaHora) })),
    ahora,
  );
  if (tomas.length === 0) return 0;

  // ON CONFLICT DO NOTHING: el índice único parcial descarta las tomas que ya tienen uno activo.
  const creados = await tx.recordatorio.createManyAndReturn({
    data: tomas.map((t) => ({
      tipo: 'MEDICAMENTO' as const,
      ...t,
      generadoEn: ahora,
      prioridad: prioridadDe('MEDICAMENTO', t.fechaHoraObjetivo, ahora),
    })),
    skipDuplicates: true,
  });
  for (const r of creados) {
    await registrarAuditoria(tx, {
      accion: 'GENERAR',
      entidad: 'Recordatorio',
      entidadId: r.id,
      pacienteId: r.pacienteId,
      nuevo: {
        tipo: r.tipo,
        prescripcionId: r.prescripcionId,
        fechaHoraObjetivo: r.fechaHoraObjetivo,
        prioridad: r.prioridad,
      },
    });
  }
  return creados.length;
}

/** T503 · S10: prioridad según lo que falta. Automática y sin auditar (D12). */
async function repriorizar(tx: Tx, ahora: Date) {
  const pendientes = await tx.recordatorio.findMany({
    where: { estado: 'PENDIENTE' },
    select: { id: true, tipo: true, fechaHoraObjetivo: true, prioridad: true },
  });
  const cambios = new Map<PrioridadRecordatorio, number[]>();
  for (const r of pendientes) {
    const nueva = prioridadDe(r.tipo, r.fechaHoraObjetivo, ahora);
    if (nueva !== r.prioridad) cambios.set(nueva, [...(cambios.get(nueva) ?? []), r.id]);
  }
  let total = 0;
  for (const [prioridad, ids] of cambios) {
    const { count } = await tx.recordatorio.updateMany({
      where: { id: { in: ids }, estado: 'PENDIENTE' },
      data: { prioridad },
    });
    total += count;
  }
  return total;
}
