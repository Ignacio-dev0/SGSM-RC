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

const contar = Prisma.sql`COUNT(DISTINCT l.suministro_id)::int`;
const deTipo = (tipo: TipoInsumoReporte) =>
  Prisma.sql`COUNT(DISTINCT l.suministro_id) FILTER (WHERE l.tipo_insumo = ${tipo})::int`;

async function totales(p: Periodo) {
  const [t] = await prisma.$queryRaw<
    { suministros: number; medicamentos: number; insumos: number; pacientes: number }[]
  >`
    ${lineasDelPeriodo(p)}
    SELECT ${contar} AS suministros, ${deTipo('MEDICAMENTO')} AS medicamentos,
           ${deTipo('INSUMO')} AS insumos, COUNT(DISTINCT l.paciente_id)::int AS pacientes
    FROM lineas l`;
  return t ?? { suministros: 0, medicamentos: 0, insumos: 0, pacientes: 0 };
}

/** D44: "más usado" = en más suministros (las cantidades de insumos distintos no se comparan). */
async function insumosMasUsados(p: Periodo) {
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
    SELECT l.insumo_id AS "insumoId", i.nombre, i.presentacion, l.tipo_insumo AS tipo,
           ${contar} AS suministros
    FROM lineas l JOIN insumos i ON i.id = l.insumo_id
    GROUP BY l.insumo_id, i.nombre, i.presentacion, l.tipo_insumo`;
  return filas
    .sort((a, b) => b.suministros - a.suministros || alfabetico(a.nombre, b.nombre))
    .slice(0, TOP_INSUMOS);
}

async function consumoPorTipo(p: Periodo) {
  const filas = await prisma.$queryRaw<{ tipo: TipoInsumoReporte; suministros: number }[]>`
    ${lineasDelPeriodo(p)}
    SELECT l.tipo_insumo AS tipo, ${contar} AS suministros FROM lineas l GROUP BY 1`;
  return TIPOS_INSUMO.map((tipo) => ({
    tipo,
    suministros: filas.find((f) => f.tipo === tipo)?.suministros ?? 0,
  }));
}

/** Un punto por cada día del rango (en hora de Argentina), también los días sin suministros. */
async function evolucionDiaria(p: Periodo) {
  const filas = await prisma.$queryRaw<
    { fecha: string; suministros: number; medicamentos: number; insumos: number }[]
  >`
    ${lineasDelPeriodo(p)}
    SELECT ${diaArgentino(Prisma.sql`l.fecha_hora`)} AS fecha, ${contar} AS suministros,
           ${deTipo('MEDICAMENTO')} AS medicamentos, ${deTipo('INSUMO')} AS insumos
    FROM lineas l GROUP BY 1`;
  const porDia = new Map(filas.map((f) => [f.fecha, f]));
  return Array.from({ length: diasEntre(p.desde, p.hasta) }, (_, i) => {
    const fecha = sumarDias(p.desde, i);
    const f = porDia.get(fecha);
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
  const [t, top, porTipo, evolucion, recs] = await Promise.all([
    totales(p),
    insumosMasUsados(p),
    consumoPorTipo(p),
    evolucionDiaria(p),
    recordatorios(p),
  ]);
  const { desde, hasta, salaId, tipo } = p;
  return {
    data: {
      totales: t,
      insumosMasUsados: top,
      consumoPorTipo: porTipo,
      evolucionDiaria: evolucion,
      recordatorios: recs,
    },
    meta: { parametros: { desde, hasta, salaId, tipo }, dias: diasEntre(desde, hasta) },
  };
}

export type Estadisticas = Awaited<ReturnType<typeof estadisticasDelPeriodo>>;
