import type { Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { horaArgentina } from '../../comun/fechas';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma, type ClienteDb } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { comprobarValidacion, consumirValidacion } from '../biometria/validacion.servicio';
import { tomaMasCercana } from '../prescripciones/agenda';
import { bloquearPrescripcion } from '../prescripciones/prescripciones.servicio';
import { atenderPorAdministracion } from '../recordatorios/atencion.servicio';
import { avisarCambioRecordatorios } from '../tiempo-real/bus';
import type { Administracion, RegistroInsumos } from './suministros.esquemas';

/**
 * Registro de suministros (T408 · T409 · T410 · CU20 · CU21 · RN07). Cada registro queda
 * asociado al paciente, al usuario que lo hizo y validó su rostro y, si es un medicamento, a la
 * prescripción vigente que lo indica.
 */

const persona = { select: { id: true, apellido: true, nombre: true } } as const;

export const incluirSuministro = {
  paciente: {
    select: {
      id: true,
      apellido: true,
      nombre: true,
      dni: true,
      asignaciones: { where: { fechaHasta: null }, select: { cama: { select: { numero: true } } } },
    },
  },
  usuario: persona,
  corregidoPor: persona,
  prescripcion: { include: { insumo: true } },
  detalles: { include: { insumo: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.SuministroInclude;

export type SuministroCompleto = Prisma.SuministroGetPayload<{ include: typeof incluirSuministro }>;

const nombre = (u: { apellido: string; nombre: string }) => `${u.apellido}, ${u.nombre}`;

/** Fin del plazo para corregir un suministro (CU23). */
export const limiteCorreccion = (s: { fechaHora: Date }) =>
  new Date(s.fechaHora.getTime() + config.suministros.plazoCorreccionHoras * 3_600_000);

export function aDtoSuministro(s: SuministroCompleto) {
  const p = s.prescripcion;
  return {
    id: s.id,
    tipo: s.tipo,
    fechaHora: s.fechaHora,
    paciente: {
      id: s.paciente.id,
      apellido: s.paciente.apellido,
      nombre: s.paciente.nombre,
      dni: s.paciente.dni,
      cama: s.paciente.asignaciones[0]?.cama.numero ?? null,
    },
    usuario: { id: s.usuario.id, nombre: nombre(s.usuario) },
    prescripcion: p
      ? {
          id: p.id,
          medicamento: p.insumo.nombre,
          dosis: p.dosis,
          unidadDosis: p.unidadDosis,
          frecuenciaHoras: p.frecuenciaHoras,
        }
      : null,
    /** La toma para la que se dio, guardada al registrarla (D121). */
    tomaProgramada: s.tomaProgramada,
    detalles: s.detalles.map((d) => ({
      insumoId: d.insumoId,
      insumo: d.insumo.nombre,
      tipoInsumo: d.insumo.tipo,
      cantidad: d.cantidad,
      unidad: p ? p.unidadDosis : d.insumo.unidadMedida,
    })),
    observaciones: s.observaciones,
    validadoBiometricamente: s.validadoBiometricamente,
    corregido: s.corregidoEn !== null,
    motivoCorreccion: s.motivoCorreccion,
    corregidoEn: s.corregidoEn,
    corregidoPor: s.corregidoPor ? nombre(s.corregidoPor) : null,
    corregibleHasta: limiteCorreccion(s),
  };
}

/** Valores que se guardan en la auditoría: qué se dio y cuánto. */
export const detallesParaAuditoria = (s: SuministroCompleto) =>
  s.detalles.map((d) => `${d.insumo.nombre} × ${d.cantidad}`).join(', ');

async function pacienteInternado(db: ClienteDb, pacienteId: number) {
  const paciente = await db.paciente.findUnique({ where: { id: pacienteId } });
  if (!paciente) throw noEncontrado('El paciente no existe');
  if (paciente.estado !== 'INTERNADO') {
    throw conflicto('PACIENTE_NO_INTERNADO', 'El paciente no está internado');
  }
}

const sinPrescripcion = (detalle: string) =>
  reglaNegocio('SIN_PRESCRIPCION_VIGENTE', `No se puede registrar el medicamento: ${detalle}`);

/**
 * RN07: el medicamento solo se administra sobre una prescripción vigente del mismo paciente y ya
 * en curso (se admite adelantar la primera toma hasta media frecuencia antes del inicio).
 * Devuelve también la toma de ahora, la que se guarda con la administración (D121).
 */
async function prescripcionVigente(db: ClienteDb, prescripcionId: number, pacienteId: number) {
  const p = await db.prescripcion.findUnique({
    where: { id: prescripcionId },
    include: { insumo: true },
  });
  if (!p || p.pacienteId !== pacienteId) {
    throw sinPrescripcion('la prescripción no corresponde a este paciente');
  }
  if (p.estado !== 'VIGENTE') {
    throw sinPrescripcion(`la prescripción está ${p.estado.toLowerCase()}`);
  }
  const ahora = reloj.ahora();
  const toma = tomaMasCercana(p, ahora);
  if (toma === null) throw sinPrescripcion('la prescripción todavía no comenzó');
  if (p.fechaFin && p.fechaFin < ahora) throw sinPrescripcion('la prescripción ya terminó');
  return { p, ahora, toma };
}

/** Una administración anterior que obliga a confirmar a propósito (D113 · D123). */
interface Previa {
  /** La toma que ya se dio, o null si es una dosis reciente de otra toma (D123). */
  toma: Date | null;
  fechaHora: Date;
  usuario: string;
}

/**
 * D113: la administración que ya tiene la toma de ahora (por la toma que guardó, D121). D123: si
 * no hay, una dosis de esta prescripción de hace menos de media frecuencia, aunque sea de otra
 * toma o de antes de reanudar: dar otra tan seguido también se confirma a propósito.
 */
async function administracionPrevia(
  tx: Prisma.TransactionClient,
  p: { id: number; frecuenciaHoras: number },
  toma: Date,
  ahora: Date,
): Promise<Previa | null> {
  const orden = [
    { fechaHora: 'desc' },
    { id: 'desc' },
  ] satisfies Prisma.SuministroOrderByWithRelationInput[];
  const deLaToma = await tx.suministro.findFirst({
    where: { prescripcionId: p.id, tipo: 'MEDICAMENTO', tomaProgramada: toma },
    orderBy: orden,
    include: { usuario: persona },
  });
  if (deLaToma) return { toma, fechaHora: deLaToma.fechaHora, usuario: nombre(deLaToma.usuario) };
  const mediaFrecuencia = (p.frecuenciaHoras * 3_600_000) / 2;
  const reciente = await tx.suministro.findFirst({
    where: {
      prescripcionId: p.id,
      tipo: 'MEDICAMENTO',
      fechaHora: { gt: new Date(ahora.getTime() - mediaFrecuencia), lte: ahora },
    },
    orderBy: orden,
    include: { usuario: persona },
  });
  return reciente
    ? { toma: null, fechaHora: reciente.fechaHora, usuario: nombre(reciente.usuario) }
    : null;
}

/** "40 min", "2 h", "3 h 5 min". */
function duracion(ms: number) {
  const minutos = Math.round(ms / 60_000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * D113 · D123: una toma que ya se dio (o una dosis de hace menos de media frecuencia) no se
 * vuelve a registrar salvo que la persona marque que corresponde otra (`otraToma`). Las
 * decisiones clínicas no las toma el sistema: solo exige que sea a propósito, y la auditoría lo
 * dice. `detalles.motivo` dice cuál de los dos casos fue, para que la pantalla no hable de "esta
 * toma" cuando la dosis fue de otra: `MISMA_TOMA` (D113) o `DOSIS_RECIENTE` (D123).
 */
function tomaYaDada(previa: Previa, frecuenciaHoras: number, ahora: Date) {
  const cuando = `a las ${horaArgentina(previa.fechaHora)} (${previa.usuario})`;
  const que = previa.toma
    ? `La toma de las ${horaArgentina(previa.toma)} ya se dio ${cuando}.`
    : `Ya se dio una dosis ${cuando}, hace ${duracion(ahora.getTime() - previa.fechaHora.getTime())}, y la indicación es cada ${frecuenciaHoras} h.`;
  return conflicto(
    'TOMA_YA_DADA',
    `${que} Si corresponde dar otra, márquelo y vuelva a confirmar.`,
    {
      motivo: previa.toma ? 'MISMA_TOMA' : 'DOSIS_RECIENTE',
      fechaHora: previa.fechaHora.toISOString(),
      usuario: previa.usuario,
    },
  );
}

/** Lo que queda en la auditoría cuando se marcó `otraToma` y de verdad había una previa. */
const detalleOtraToma = (previa: Previa) => {
  const cuando = `a las ${horaArgentina(previa.fechaHora)} (${previa.usuario})`;
  const que = previa.toma
    ? `la de las ${horaArgentina(previa.toma)} ya se había dado ${cuando}`
    : `ya se había dado una dosis ${cuando}`;
  return `Se marcó que corresponde dar otra toma: ${que}`.slice(0, 255);
};

async function crearYAuditar(
  tx: Prisma.TransactionClient,
  data: Prisma.SuministroUncheckedCreateInput,
  actorId: number,
  detalle: string | null = null,
) {
  const s = await tx.suministro.create({ data, include: incluirSuministro });
  await registrarAuditoria(tx, {
    usuarioId: actorId,
    accion: 'REGISTRAR',
    entidad: 'Suministro',
    entidadId: s.id,
    pacienteId: s.pacienteId,
    nuevo: {
      tipo: s.tipo,
      detalles: detallesParaAuditoria(s),
      prescripcionId: s.prescripcionId,
      validadoBiometricamente: true,
    },
    detalle,
  });
  return aDtoSuministro(s);
}

/**
 * Administración de un medicamento prescripto (CU20 · T408), confirmada con la cara. Guarda la
 * toma a la que se atribuye (D121). En la misma transacción atiende el recordatorio de esa toma
 * (T507) y, si atendió uno, avisa al tiempo real después del commit.
 */
export async function registrarAdministracion(datos: Administracion, usuarioId: number) {
  const { suministro, atendido } = await prisma.$transaction(async (tx) => {
    // D121: primero el bloqueo y después la lectura. Dos administraciones de la misma
    // prescripción van de a una, y un cambio de agenda que se confirma en el medio se ve.
    await bloquearPrescripcion(tx, datos.prescripcionId);
    await pacienteInternado(tx, datos.pacienteId);
    const { p, ahora, toma } = await prescripcionVigente(
      tx,
      datos.prescripcionId,
      datos.pacienteId,
    );
    // El comprobante se revisa antes y se gasta después: un TOMA_YA_DADA no obliga a volver a
    // validar el rostro para reenviar con otraToma (D113).
    comprobarValidacion(datos.validacionToken, usuarioId);
    const previa = await administracionPrevia(tx, p, toma, ahora);
    if (previa && !datos.otraToma) throw tomaYaDada(previa, p.frecuenciaHoras, ahora);
    consumirValidacion(datos.validacionToken, usuarioId);
    const suministro = await crearYAuditar(
      tx,
      {
        pacienteId: datos.pacienteId,
        usuarioId,
        tipo: 'MEDICAMENTO',
        prescripcionId: p.id,
        fechaHora: ahora,
        tomaProgramada: toma,
        observaciones: datos.observaciones,
        validadoBiometricamente: true,
        detalles: { create: [{ insumoId: p.insumoId, cantidad: datos.cantidad ?? p.dosis }] },
      },
      usuarioId,
      previa ? detalleOtraToma(previa) : null,
    );
    const atendido = await atenderPorAdministracion(tx, {
      prescripcionId: p.id,
      toma,
      suministroId: suministro.id,
      fechaHora: suministro.fechaHora,
      usuarioId,
    });
    return { suministro, atendido };
  });
  if (atendido) avisarCambioRecordatorios();
  return suministro;
}

/**
 * Comprueba que los insumos existan, estén activos y no sean medicamentos (T410). Los bloquea
 * para leer (D116): un cambio de tipo en curso termina antes y se lee el tipo nuevo.
 */
export async function verificarInsumos(
  tx: Prisma.TransactionClient,
  items: { insumoId: number }[],
) {
  const ids = items.map((i) => i.insumoId);
  await tx.$queryRaw`SELECT 1 FROM insumos WHERE id = ANY(${ids}::int[]) ORDER BY id FOR SHARE`;
  const insumos = await tx.insumo.findMany({ where: { id: { in: ids } } });
  for (const item of items) {
    const insumo = insumos.find((i) => i.id === item.insumoId);
    if (!insumo) throw noEncontrado(`El insumo ${item.insumoId} no existe`);
    if (insumo.tipo === 'MEDICAMENTO') {
      throw sinPrescripcion(
        `${insumo.nombre} es un medicamento y se registra desde su prescripción vigente`,
      );
    }
    if (!insumo.activo) {
      throw reglaNegocio(
        'INSUMO_NO_DISPONIBLE',
        `${insumo.nombre} está dado de baja en el catálogo`,
      );
    }
  }
}

/** Varios insumos no medicinales en un solo movimiento (CU21 · T409). */
export async function registrarInsumos(datos: RegistroInsumos, usuarioId: number) {
  return prisma.$transaction(async (tx) => {
    await pacienteInternado(tx, datos.pacienteId);
    await verificarInsumos(tx, datos.items);
    consumirValidacion(datos.validacionToken, usuarioId);
    return crearYAuditar(
      tx,
      {
        pacienteId: datos.pacienteId,
        usuarioId,
        tipo: 'INSUMOS',
        fechaHora: reloj.ahora(),
        observaciones: datos.observaciones,
        validadoBiometricamente: true,
        detalles: {
          create: datos.items.map((i) => ({ insumoId: i.insumoId, cantidad: i.cantidad })),
        },
      },
      usuarioId,
    );
  });
}
