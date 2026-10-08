import { Prisma } from '@prisma/client';
import { inicioDelDia, sumarDias } from '../../comun/fechas';
import { respuestaPaginada } from '../../comun/paginacion';
import { prisma } from '../../db';
import type { BusquedaAuditoria, OrigenAuditoria } from './auditoria.esquemas';

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

/** El mayor id que entra en una columna `integer` de PostgreSQL. */
const ID_MAXIMO = 2_147_483_647;

/** Los ids numéricos (sin repetir) de las filas de una entidad. */
function idsDe(filas: { entidad: string; entidadId: string | null }[], entidad: string) {
  const ids = filas.flatMap((a) =>
    a.entidad === entidad && a.entidadId && /^\d{1,10}$/.test(a.entidadId)
      ? [Number(a.entidadId)]
      : [],
  );
  return [...new Set(ids.filter((id) => id > 0 && id <= ID_MAXIMO))];
}

const ninguno = Promise.resolve([]);

/**
 * D114: el nombre legible del registro afectado, para no mostrar "Usuario n.º 4". Una consulta
 * por tipo de registro presente en la página (no una por fila) y solo los tipos con nombre:
 * usuario y paciente ("Apellido, Nombre"), insumo (nombre y presentación) y prescripción
 * ("Medicamento · Apellido, Nombre"). Los pacientes salen de la misma consulta que la columna
 * Paciente. Devuelve las etiquetas por "Entidad:id".
 */
async function etiquetasDe(
  filas: { entidad: string; entidadId: string | null; pacienteId: number | null }[],
) {
  const idsPacientes = new Set([
    ...filas.flatMap((a) => (a.pacienteId ? [a.pacienteId] : [])),
    ...idsDe(filas, 'Paciente'),
  ]);
  const usuarios = idsDe(filas, 'Usuario');
  const insumos = idsDe(filas, 'Insumo');
  const prescripciones = idsDe(filas, 'Prescripcion');
  const [pacientes, us, ins, ps] = await Promise.all([
    idsPacientes.size > 0
      ? prisma.paciente.findMany({
          where: { id: { in: [...idsPacientes] } },
          select: { id: true, apellido: true, nombre: true, dni: true },
        })
      : ninguno,
    usuarios.length > 0
      ? prisma.usuario.findMany({
          where: { id: { in: usuarios } },
          select: { id: true, apellido: true, nombre: true },
        })
      : ninguno,
    insumos.length > 0
      ? prisma.insumo.findMany({
          where: { id: { in: insumos } },
          select: { id: true, nombre: true, presentacion: true },
        })
      : ninguno,
    prescripciones.length > 0
      ? prisma.prescripcion.findMany({
          where: { id: { in: prescripciones } },
          select: {
            id: true,
            insumo: { select: { nombre: true } },
            paciente: { select: { apellido: true, nombre: true } },
          },
        })
      : ninguno,
  ]);
  const etiquetas = new Map<string, string>([
    ...pacientes.map((p): [string, string] => [`Paciente:${p.id}`, nombreDe(p)]),
    ...us.map((u): [string, string] => [`Usuario:${u.id}`, nombreDe(u)]),
    ...ins.map((i): [string, string] => [`Insumo:${i.id}`, `${i.nombre} ${i.presentacion}`.trim()]),
    ...ps.map((p): [string, string] => [
      `Prescripcion:${p.id}`,
      `${p.insumo.nombre} · ${nombreDe(p.paciente)}`,
    ]),
  ]);
  return { pacientes: new Map(pacientes.map((p) => [p.id, p])), etiquetas };
}

/** Personas: con usuario; sistema: sin usuario (el temporizador, el instalador). D101. */
const POR_ORIGEN: Record<OrigenAuditoria, Prisma.AuditoriaWhereInput> = {
  personas: { usuarioId: { not: null } },
  sistema: { usuarioId: null },
};

function filtros(f: BusquedaAuditoria): Prisma.AuditoriaWhereInput {
  return {
    // En AND para no pisar a usuarioId: un usuario con origen=sistema no trae nada.
    ...(f.origen ? { AND: [POR_ORIGEN[f.origen]] } : {}),
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

const ORDEN: Prisma.AuditoriaOrderByWithRelationInput[] = [{ fechaHora: 'desc' }, { id: 'desc' }];

export async function consultarAuditoria(f: BusquedaAuditoria) {
  const where = filtros(f);
  // En dos pasos (D72): primero los ids de la página, que salen solo del índice
  // (fecha_hora, id, usuario_id) aunque la página sea lejana y se filtre por origen (D101);
  // después, las filas completas de esos ids.
  const [, pagina, total] = await prisma.$transaction([
    // Las acciones son muy desparejas (REGISTRAR es 2/3 de la tabla, EXPORTAR casi nada): se
    // planifica cada vez con los valores pedidos, no con el plan genérico que PostgreSQL adopta
    // tras el 5.º pedido preparado y que contaba 400.000 filas por el índice de acción (D73).
    prisma.$executeRaw`SET LOCAL plan_cache_mode = force_custom_plan`,
    prisma.auditoria.findMany({
      where,
      select: { id: true },
      orderBy: ORDEN,
      skip: (f.pagina - 1) * f.tamano,
      take: f.tamano,
    }),
    prisma.auditoria.count({ where }),
  ]);
  const filas = await prisma.auditoria.findMany({
    where: { id: { in: pagina.map((a) => a.id) } },
    include: { usuario: { select: { id: true, apellido: true, nombre: true } } },
    orderBy: ORDEN,
  });
  // La auditoría guarda los ids sin relación: los nombres se buscan juntos, por tipo (D114).
  const { pacientes, etiquetas } = await etiquetasDe(filas);

  const data = filas.map((a) => {
    const paciente = a.pacienteId ? pacientes.get(a.pacienteId) : undefined;
    return {
      id: a.id,
      fechaHora: a.fechaHora,
      accion: a.accion,
      entidad: a.entidad,
      entidadId: a.entidadId,
      entidadEtiqueta: etiquetas.get(`${a.entidad}:${a.entidadId}`) ?? null,
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

/**
 * Valores distintos de una columna saltando por su índice (D73): una búsqueda en el índice por
 * cada valor, en lugar de leer la tabla entera (`distinct` de Prisma trae todas las filas y
 * descarta en memoria). `accion` usa auditoria(accion, …) y `entidad`, auditoria(entidad, …).
 */
async function distintos(columna: 'accion' | 'entidad'): Promise<string[]> {
  const c = Prisma.raw(`"${columna}"`);
  const filas = await prisma.$queryRaw<{ valor: string | null }[]>`
    WITH RECURSIVE v(valor) AS (
      (SELECT ${c} FROM auditoria ORDER BY ${c} LIMIT 1)
      UNION ALL
      SELECT (SELECT ${c} FROM auditoria WHERE ${c} > v.valor ORDER BY ${c} LIMIT 1)
      FROM v WHERE v.valor IS NOT NULL
    )
    SELECT valor FROM v WHERE valor IS NOT NULL`;
  return filas.map((f) => f.valor!);
}

/** Acciones y entidades que hay en la base, para armar los filtros (no una lista fija). */
export async function opcionesDeAuditoria() {
  const [acciones, entidades] = await Promise.all([distintos('accion'), distintos('entidad')]);
  const orden = (a: string, b: string) => a.localeCompare(b, 'es');
  return { acciones: acciones.sort(orden), entidades: entidades.sort(orden) };
}
