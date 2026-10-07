import type { Prisma } from '@prisma/client';
import { inicioDelDia, sumarDias } from '../../comun/fechas';
import { respuestaPaginada } from '../../comun/paginacion';
import { prisma } from '../../db';
import type { BusquedaAuditoria } from './auditoria.esquemas';

/**
 * Consulta de la auditoría (T604 · CU35 · RNF10): filtros, paginación y, por las dudas, las
 * claves sensibles ocultas en la respuesta (D49). La forma de cada entrada es el contrato con el
 * frontend: docs/reportes.md.
 */

/**
 * Claves que nunca se muestran, aunque hoy registrarAuditoria ya no las guarda: contraseñas y su
 * hash, el patrón facial, fotos, comprobantes y tokens.
 */
const CLAVE_SENSIBLE = /contrase(n|ñ)a|password|hash|patron|foto|token|secret/i;

/** Copia el valor ocultando, a cualquier profundidad, las claves sensibles. */
export function ocultarSensibles(valor: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(valor)) return valor.map(ocultarSensibles);
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, v]) => [
        clave,
        CLAVE_SENSIBLE.test(clave) ? '[oculto]' : ocultarSensibles(v ?? null),
      ]),
    );
  }
  return valor;
}

const nombreDe = (p: { apellido: string; nombre: string }) => `${p.apellido}, ${p.nombre}`;

function filtros(f: BusquedaAuditoria): Prisma.AuditoriaWhereInput {
  return {
    ...(f.usuarioId ? { usuarioId: f.usuarioId } : {}),
    ...(f.pacienteId ? { pacienteId: f.pacienteId } : {}),
    ...(f.accion ? { accion: f.accion } : {}),
    ...(f.entidad ? { entidad: f.entidad } : {}),
    ...(f.desde || f.hasta
      ? {
          fechaHora: {
            ...(f.desde ? { gte: inicioDelDia(f.desde) } : {}),
            ...(f.hasta ? { lt: inicioDelDia(sumarDias(f.hasta, 1)) } : {}),
          },
        }
      : {}),
  };
}

export async function consultarAuditoria(f: BusquedaAuditoria) {
  const where = filtros(f);
  const [filas, total] = await prisma.$transaction([
    prisma.auditoria.findMany({
      where,
      include: { usuario: { select: { id: true, apellido: true, nombre: true } } },
      orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
      skip: (f.pagina - 1) * f.tamano,
      take: f.tamano,
    }),
    prisma.auditoria.count({ where }),
  ]);
  // La auditoría guarda el id del paciente sin relación: se buscan todos juntos.
  const idsPacientes = [...new Set(filas.flatMap((a) => (a.pacienteId ? [a.pacienteId] : [])))];
  const pacientes = new Map(
    (
      await prisma.paciente.findMany({
        where: { id: { in: idsPacientes } },
        select: { id: true, apellido: true, nombre: true, dni: true },
      })
    ).map((p) => [p.id, p]),
  );

  const data = filas.map((a) => {
    const paciente = a.pacienteId ? pacientes.get(a.pacienteId) : undefined;
    return {
      id: a.id,
      fechaHora: a.fechaHora,
      accion: a.accion,
      entidad: a.entidad,
      entidadId: a.entidadId,
      usuario: a.usuario
        ? { id: a.usuario.id, nombre: nombreDe(a.usuario) }
        : { id: null, nombre: 'Sistema' },
      paciente: a.pacienteId
        ? {
            id: a.pacienteId,
            nombre: paciente ? nombreDe(paciente) : `Paciente ${a.pacienteId}`,
            dni: paciente?.dni ?? null,
          }
        : null,
      valorAnterior: ocultarSensibles(a.valorAnterior),
      valorNuevo: ocultarSensibles(a.valorNuevo),
      detalle: a.detalle,
    };
  });
  return respuestaPaginada(data, total, { pagina: f.pagina, porPagina: f.tamano });
}

export type EntradaAuditoriaDto = Awaited<ReturnType<typeof consultarAuditoria>>['data'][number];

/** Acciones y entidades que hay en la base, para armar los filtros (no una lista fija). */
export async function opcionesDeAuditoria() {
  const [acciones, entidades] = await Promise.all([
    prisma.auditoria.findMany({ distinct: ['accion'], select: { accion: true } }),
    prisma.auditoria.findMany({ distinct: ['entidad'], select: { entidad: true } }),
  ]);
  const orden = (a: string, b: string) => a.localeCompare(b, 'es');
  return {
    acciones: acciones.map((a) => a.accion).sort(orden),
    entidades: entidades.map((e) => e.entidad).sort(orden),
  };
}
