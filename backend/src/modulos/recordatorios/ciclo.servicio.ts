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
 * Un ciclo del temporizador de recordatorios (T501–T504 · T508): vence los atrasados (y avisa a
 * los administradores), genera los de las tomas y los estudios que se acercan y recalcula la
 * prioridad de los pendientes. Todo en una transacción con un candado de PostgreSQL, para que
 * dos procesos (o dos ciclos superpuestos) no hagan el mismo trabajo; el índice único parcial es
 * la última barrera contra duplicados. El aviso al tiempo real sale DESPUÉS del commit.
 */

/** Número del candado de PostgreSQL (pg_try_advisory_xact_lock) del ciclo de recordatorios. */
const CANDADO_DEL_CICLO = 50_501;

type Tx = Prisma.TransactionClient;

/**
 * Espera el candado del ciclo dentro de la transacción de quien llama (D30): un cambio de estudio
 * no se cruza con un ciclo que está generando su recordatorio. El ciclo lo pide sin esperar, así
 * que mientras tanto ese minuto se saltea y lo hace el siguiente.
 */
export async function esperarCandadoDelCiclo(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CANDADO_DEL_CICLO}::bigint)`;
}

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
      asignaciones: {
        where: { fechaHasta: null },
        select: { cama: { select: { numero: true, sala: { select: { nombre: true } } } } },
      },
    },
  },
  prescripcion: { include: { insumo: true } },
  estudio: true,
} satisfies Prisma.RecordatorioInclude;

type RecordatorioParaAviso = Prisma.RecordatorioGetPayload<{ include: typeof incluirParaAviso }>;

/**
 * "Recordatorio vencido sin atender: Paracetamol de las 05:00 · Benítez, Rosa (Sala A –
 * Neurorrehabilitación, cama A-01)": con la sala, para ir sin abrir la ficha.
 */
function mensajeDeVencido(r: RecordatorioParaAviso) {
  const que = r.prescripcion
    ? r.prescripcion.insumo.nombre
    : `estudio ${r.estudio?.nombre ?? ''}`.trim();
  const cama = r.paciente.asignaciones[0]?.cama;
  const donde = cama ? ` (${cama.sala.nombre}, cama ${cama.numero})` : '';
  const quien = `${r.paciente.apellido}, ${r.paciente.nombre}${donde}`;
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

/**
 * T502 · T504: un recordatorio por cada toma y cada estudio de la ventana que todavía no lo
 * tenga. Un solo INSERT para los dos tipos.
 */
async function generar(tx: Tx, ahora: Date) {
  const nuevos = [
    ...(await tomasDeLaVentana(tx, ahora)),
    ...(await estudiosDeLaVentana(tx, ahora)),
  ];
  if (nuevos.length === 0) return 0;

  // ON CONFLICT DO NOTHING: el índice único parcial descarta los que ya tienen uno activo.
  const creados = await tx.recordatorio.createManyAndReturn({ data: nuevos, skipDuplicates: true });
  for (const r of creados) {
    await registrarAuditoria(tx, {
      accion: 'GENERAR',
      entidad: 'Recordatorio',
      entidadId: r.id,
      pacienteId: r.pacienteId,
      nuevo: {
        tipo: r.tipo,
        prescripcionId: r.prescripcionId ?? undefined,
        estudioId: r.estudioId ?? undefined,
        fechaHoraObjetivo: r.fechaHoraObjetivo,
        prioridad: r.prioridad,
      },
    });
  }
  return creados.length;
}

/** T502: las tomas de la ventana que no tienen una administración. */
async function tomasDeLaVentana(
  tx: Tx,
  ahora: Date,
): Promise<Prisma.RecordatorioCreateManyInput[]> {
  const { desde, hasta } = ventanaDeGeneracion(ahora);
  const prescripciones = await tx.prescripcion.findMany({
    where: {
      estado: 'VIGENTE',
      paciente: { estado: 'INTERNADO' },
      agendaDesde: { lte: hasta },
      OR: [{ fechaFin: null }, { fechaFin: { gte: desde } }],
    },
    select: {
      id: true,
      pacienteId: true,
      fechaInicio: true,
      agendaDesde: true,
      frecuenciaHoras: true,
      fechaFin: true,
      // D121: las administraciones de las tomas de la ventana, por la toma que guardaron.
      suministros: {
        where: { tomaProgramada: { gte: desde, lte: hasta } },
        select: { tomaProgramada: true },
      },
    },
  });
  const tomas = tomasParaRecordar(
    prescripciones.map((p) => ({
      ...p,
      tomasDadas: p.suministros.flatMap((s) => (s.tomaProgramada ? [s.tomaProgramada] : [])),
    })),
    ahora,
  );
  return tomas.map((t) => ({
    tipo: 'MEDICAMENTO',
    ...t,
    generadoEn: ahora,
    prioridad: prioridadDe('MEDICAMENTO', t.fechaHoraObjetivo, ahora),
  }));
}

/** T504: los estudios programados de pacientes internados cuya hora cae en la ventana. */
async function estudiosDeLaVentana(
  tx: Tx,
  ahora: Date,
): Promise<Prisma.RecordatorioCreateManyInput[]> {
  const { desde, hasta } = ventanaDeGeneracion(ahora);
  const estudios = await tx.estudio.findMany({
    where: {
      estado: 'PROGRAMADO',
      paciente: { estado: 'INTERNADO' },
      fechaHora: { gte: desde, lte: hasta },
    },
    select: { id: true, pacienteId: true, fechaHora: true },
  });
  return estudios.map((e) => ({
    tipo: 'ESTUDIO',
    estudioId: e.id,
    pacienteId: e.pacienteId,
    fechaHoraObjetivo: e.fechaHora,
    generadoEn: ahora,
    prioridad: prioridadDe('ESTUDIO', e.fechaHora, ahora),
  }));
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
