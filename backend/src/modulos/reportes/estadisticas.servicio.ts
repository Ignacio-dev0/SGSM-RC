import { Prisma } from '@prisma/client';
import { diasEntre, sumarDias } from '../../comun/fechas';
import { prisma } from '../../db';
import {
  alfabetico,
  diaArgentino,
  enSala,
  limites,
  lineasDelPeriodo,
  salaDelFiltro,
} from './consultas';
import { TIPOS_INSUMO, type Periodo, type TipoInsumoReporte } from './reportes.esquemas';

/**
 * Estadísticas del período (T602 · CU33 · RF12): los indicadores del plan de trabajo. La forma
 * de la respuesta es el contrato con el frontend: docs/reportes.md.
 */

/** Cuántos insumos trae el ranking de más usados. */
export const TOP_INSUMOS = 10;

/**
 * Suministros de cada día con suministros (D74): cada suministro se cuenta una vez, con los tipos
 * de sus insumos. De acá salen también los totales y el consumo por tipo (un suministro es de un
 * solo día), en lugar de recorrer el año una vez más para cada uno.
 */
async function porDia(p: Periodo) {
  return prisma.$queryRaw<
    { fecha: string; suministros: number; medicamentos: number; insumos: number }[]
  >`
    ${lineasDelPeriodo(p)}, por_suministro AS (
      SELECT l.suministro_id, l.fecha_hora,
             bool_or(l.tipo_insumo = 'MEDICAMENTO') AS medicamento,
             bool_or(l.tipo_insumo = 'INSUMO') AS insumo
      FROM lineas l GROUP BY l.suministro_id, l.fecha_hora
    )
    SELECT ${diaArgentino(Prisma.sql`fecha_hora`)} AS fecha, count(*)::int AS suministros,
           count(*) FILTER (WHERE medicamento)::int AS medicamentos,
           count(*) FILTER (WHERE insumo)::int AS insumos
    FROM por_suministro GROUP BY 1`;
}

/** Pacientes con al menos un suministro (DISTINCT con pocos grupos: sin ordenar todo el año). */
async function pacientesAtendidos(p: Periodo) {
  const [f] = await prisma.$queryRaw<{ pacientes: number }[]>`
    ${lineasDelPeriodo(p)}
    SELECT count(*)::int AS pacientes FROM (SELECT DISTINCT l.paciente_id FROM lineas l) x`;
  return f?.pacientes ?? 0;
}

/** D44: "más usado" = en más suministros (las cantidades de insumos distintos no se comparan). */
async function insumosMasUsados(p: Periodo) {
  // D75: se agrupa por id y después se unen nombre y presentación.
  const filas = await prisma.$queryRaw<
    {
      insumoId: number;
      nombre: string;
      presentacion: string;
      tipo: TipoInsumoReporte;
      suministros: number;
    }[]
  >`
    ${lineasDelPeriodo(p)}
    SELECT g.id AS "insumoId", i.nombre, i.presentacion, g.tipo, g.suministros
    FROM (SELECT l.insumo_id AS id, l.tipo_insumo AS tipo,
                 COUNT(DISTINCT l.suministro_id)::int AS suministros
          FROM lineas l GROUP BY 1, 2) g
    JOIN insumos i ON i.id = g.id`;
  return filas
    .sort((a, b) => b.suministros - a.suministros || alfabetico(a.nombre, b.nombre))
    .slice(0, TOP_INSUMOS);
}

/** Un punto por cada día del rango (en hora de Argentina), también los días sin suministros. */
function evolucionDiaria(p: Periodo, dias: Awaited<ReturnType<typeof porDia>>) {
  const delDia = new Map(dias.map((f) => [f.fecha, f]));
  return Array.from({ length: diasEntre(p.desde, p.hasta) }, (_, i) => {
    const fecha = sumarDias(p.desde, i);
    const f = delDia.get(fecha);
    return {
      fecha,
      suministros: f?.suministros ?? 0,
      medicamentos: f?.medicamentos ?? 0,
      insumos: f?.insumos ?? 0,
    };
  });
}

/**
 * Recordatorios con la hora objetivo en el período, sin los cancelados (S20 · D45): a tiempo
 * (atendido sin haber vencido), tarde (atendido después de vencer), no administrado (con motivo),
 * vencido sin atender y pendiente. El porcentaje es atendidos / (atendidos + vencidos sin
 * atender): los pendientes todavía no tuvieron su oportunidad. No se filtran por tipo de insumo.
 */
async function recordatorios(p: Periodo) {
  const { inicio, fin } = limites(p);
  const sala = p.salaId
    ? Prisma.sql`AND ${enSala(p.salaId, Prisma.sql`r.paciente_id`, Prisma.sql`r.fecha_hora_objetivo`)}`
    : Prisma.empty;
  const [r] = await prisma.$queryRaw<
    {
      aTiempo: number;
      tarde: number;
      noAdministrados: number;
      vencidosSinAtender: number;
      pendientes: number;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE r.estado = 'ATENDIDO' AND r.motivo_no_administrado IS NULL
                         AND r.vencido_en IS NULL)::int AS "aTiempo",
      COUNT(*) FILTER (WHERE r.estado = 'ATENDIDO' AND r.motivo_no_administrado IS NULL
                         AND r.vencido_en IS NOT NULL)::int AS tarde,
      COUNT(*) FILTER (WHERE r.estado = 'ATENDIDO'
                         AND r.motivo_no_administrado IS NOT NULL)::int AS "noAdministrados",
      COUNT(*) FILTER (WHERE r.estado = 'VENCIDO')::int AS "vencidosSinAtender",
      COUNT(*) FILTER (WHERE r.estado = 'PENDIENTE')::int AS pendientes
    FROM recordatorios r
    WHERE r.fecha_hora_objetivo >= ${inicio} AND r.fecha_hora_objetivo < ${fin}
      AND r.estado <> 'CANCELADO' ${sala}`;
  const c = r ?? { aTiempo: 0, tarde: 0, noAdministrados: 0, vencidosSinAtender: 0, pendientes: 0 };
  const atendidos = c.aTiempo + c.tarde + c.noAdministrados;
  const evaluables = atendidos + c.vencidosSinAtender;
  return {
    total: evaluables + c.pendientes,
    ...c,
    atendidos,
    porcentajeAtendido: evaluables ? Math.round((atendidos / evaluables) * 1000) / 10 : null,
  };
}

export async function estadisticasDelPeriodo(p: Periodo) {
  await salaDelFiltro(p.salaId);
  const [dias, pacientes, top, recs] = await Promise.all([
    porDia(p),
    pacientesAtendidos(p),
    insumosMasUsados(p),
    recordatorios(p),
  ]);
  const evolucion = evolucionDiaria(p, dias);
  const suma = (campo: 'suministros' | 'medicamentos' | 'insumos') =>
    evolucion.reduce((total, d) => total + d[campo], 0);
  const porTipo = { MEDICAMENTO: suma('medicamentos'), INSUMO: suma('insumos') };
  const { desde, hasta, salaId, tipo } = p;
  return {
    data: {
      totales: {
        suministros: suma('suministros'),
        medicamentos: porTipo.MEDICAMENTO,
        insumos: porTipo.INSUMO,
        pacientes,
      },
      insumosMasUsados: top,
      // Siempre los dos tipos, en este orden (para la torta).
      consumoPorTipo: TIPOS_INSUMO.map((t) => ({ tipo: t, suministros: porTipo[t] })),
      evolucionDiaria: evolucion,
      recordatorios: recs,
    },
    meta: { parametros: { desde, hasta, salaId, tipo }, dias: diasEntre(desde, hasta) },
  };
}

export type Estadisticas = Awaited<ReturnType<typeof estadisticasDelPeriodo>>;
