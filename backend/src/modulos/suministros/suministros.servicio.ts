import type { Prisma } from '@prisma/client';
import { conflicto, noEncontrado, reglaNegocio } from '../../comun/errores';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma, type ClienteDb } from '../../db';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { consumirValidacion } from '../biometria/validacion.servicio';
import { tomaMasCercana } from '../prescripciones/agenda';
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
    tomaProgramada: p ? tomaMasCercana(p, s.fechaHora) : null,
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
  if (tomaMasCercana(p, ahora) === null)
    throw sinPrescripcion('la prescripción todavía no comenzó');
  if (p.fechaFin && p.fechaFin < ahora) throw sinPrescripcion('la prescripción ya terminó');
  return p;
}

async function crearYAuditar(
  tx: Prisma.TransactionClient,
  data: Prisma.SuministroUncheckedCreateInput,
  actorId: number,
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
  });
  return aDtoSuministro(s);
}

/** Administración de un medicamento prescripto (CU20 · T408), confirmada con la cara. */
export async function registrarAdministracion(datos: Administracion, usuarioId: number) {
  return prisma.$transaction(async (tx) => {
    await pacienteInternado(tx, datos.pacienteId);
    const p = await prescripcionVigente(tx, datos.prescripcionId, datos.pacienteId);
    consumirValidacion(datos.validacionToken, usuarioId);
    return crearYAuditar(
      tx,
      {
        pacienteId: datos.pacienteId,
        usuarioId,
        tipo: 'MEDICAMENTO',
        prescripcionId: p.id,
        fechaHora: reloj.ahora(),
        observaciones: datos.observaciones,
        validadoBiometricamente: true,
        detalles: { create: [{ insumoId: p.insumoId, cantidad: datos.cantidad ?? p.dosis }] },
      },
      usuarioId,
    );
  });
}

/** Comprueba que los insumos existan, estén activos y no sean medicamentos (T410). */
export async function verificarInsumos(db: ClienteDb, items: { insumoId: number }[]) {
  const insumos = await db.insumo.findMany({ where: { id: { in: items.map((i) => i.insumoId) } } });
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
