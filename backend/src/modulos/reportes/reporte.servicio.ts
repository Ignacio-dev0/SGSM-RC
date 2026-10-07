import { Prisma } from '@prisma/client';
import { fechaLegible } from '../../comun/fechas';
import { prisma } from '../../db';
import {
  alfabetico,
  diaArgentino,
  lineasDelPeriodo,
  nombreCompleto,
  redondear,
  salaDelFiltro,
} from './consultas';
import type { ParametrosReporte, Periodo, TipoInsumoReporte } from './reportes.esquemas';

/**
 * Reporte de suministros agrupado con totales (T601 · CU32 · RF11). La forma de la respuesta es
 * el contrato con el frontend: docs/reportes.md.
 */

export interface FilaReporte {
  /** Única en el reporte: id del paciente o del usuario, 'insumoId|unidad' o 'AAAA-MM-DD'. */
  clave: string;
  /** Id del paciente, el usuario o el insumo; null al agrupar por día. */
  id: number | null;
  /** "Apellido, Nombre", "Insumo · Presentación" o la fecha 'DD/MM/AAAA'. */
  etiqueta: string;
  /** Cuántos suministros (registros) tiene el grupo. */
  suministros: number;
  /** Suma de las cantidades registradas (D42). */
  unidades: number;
  /** Solo al agrupar por insumo. */
  tipo: TipoInsumoReporte | null;
  unidad: string | null;
}

export interface Totales {
  /** Suministros distintos: uno con dos insumos cuenta una vez (D43). */
  suministros: number;
  unidades: number;
}

type Agregado = { suministros: number; unidades: number | null };

const agregados = Prisma.sql`
  COUNT(DISTINCT l.suministro_id)::int AS suministros, SUM(l.cantidad)::float8 AS unidades`;

const fila = (
  clave: string,
  id: number | null,
  etiqueta: string,
  a: Agregado,
  extra: Pick<FilaReporte, 'tipo' | 'unidad'> = { tipo: null, unidad: null },
): FilaReporte => ({
  clave,
  id,
  etiqueta,
  suministros: a.suministros,
  unidades: redondear(a.unidades),
  ...extra,
});

// D75: se agrupa por id y recién después se unen los nombres. Agrupar también por los textos
// hacía más ancho el ordenamiento de COUNT(DISTINCT) (con un año, el doble de tiempo).

async function porPaciente(p: ParametrosReporte) {
  const filas = await prisma.$queryRaw<
    (Agregado & { id: number; apellido: string; nombre: string })[]
  >`
    ${lineasDelPeriodo(p)}
    SELECT g.id, pa.apellido, pa.nombre, g.suministros, g.unidades
    FROM (SELECT l.paciente_id AS id, ${agregados} FROM lineas l GROUP BY 1) g
    JOIN pacientes pa ON pa.id = g.id`;
  return filas
    .map((f) => fila(String(f.id), f.id, nombreCompleto(f), f))
    .sort((a, b) => alfabetico(a.etiqueta, b.etiqueta));
}

async function porUsuario(p: ParametrosReporte) {
  const filas = await prisma.$queryRaw<
    (Agregado & { id: number; apellido: string; nombre: string })[]
  >`
    ${lineasDelPeriodo(p)}
    SELECT g.id, u.apellido, u.nombre, g.suministros, g.unidades
    FROM (SELECT l.usuario_id AS id, ${agregados} FROM lineas l GROUP BY 1) g
    JOIN usuarios u ON u.id = g.id`;
  return filas
    .map((f) => fila(String(f.id), f.id, nombreCompleto(f), f))
    .sort((a, b) => alfabetico(a.etiqueta, b.etiqueta));
}

/** Insumo y unidad: dos prescripciones del mismo medicamento en mg y en comprimidos no se suman. */
async function porInsumo(p: ParametrosReporte) {
  const filas = await prisma.$queryRaw<
    (Agregado & {
      id: number;
      nombre: string;
      presentacion: string;
      tipo: TipoInsumoReporte;
      unidad: string;
    })[]
  >`
    ${lineasDelPeriodo(p)}
    SELECT g.id, i.nombre, i.presentacion, g.tipo, g.unidad, g.suministros, g.unidades
    FROM (SELECT l.insumo_id AS id, l.tipo_insumo AS tipo, l.unidad, ${agregados}
          FROM lineas l GROUP BY 1, 2, 3) g
    JOIN insumos i ON i.id = g.id`;
  return filas
    .map((f) =>
      fila(
        `${f.id}|${f.unidad}`,
        f.id,
        f.presentacion ? `${f.nombre} · ${f.presentacion}` : f.nombre,
        f,
        { tipo: f.tipo, unidad: f.unidad },
      ),
    )
    .sort((a, b) => alfabetico(a.etiqueta, b.etiqueta) || alfabetico(a.unidad!, b.unidad!));
}

/** Por día en hora de Argentina (S18): solo los días con suministros. */
async function porDia(p: ParametrosReporte) {
  const filas = await prisma.$queryRaw<(Agregado & { dia: string })[]>`
    ${lineasDelPeriodo(p)}
    SELECT ${diaArgentino(Prisma.sql`l.fecha_hora`)} AS dia, ${agregados}
    FROM lineas l
    GROUP BY 1
    ORDER BY 1`;
  return filas.map((f) => fila(f.dia, null, fechaLegible(f.dia), f));
}

const AGRUPAR = { paciente: porPaciente, insumo: porInsumo, usuario: porUsuario, dia: porDia };

/** Total general del período con los mismos filtros. */
export async function totalesDelPeriodo(p: Periodo): Promise<Totales> {
  const [t] = await prisma.$queryRaw<Agregado[]>`
    ${lineasDelPeriodo(p)}
    SELECT ${agregados} FROM lineas l`;
  return { suministros: t?.suministros ?? 0, unidades: redondear(t?.unidades ?? 0) };
}

export async function reporteSuministros(p: ParametrosReporte) {
  await salaDelFiltro(p.salaId);
  const [data, totales] = await Promise.all([AGRUPAR[p.agruparPor](p), totalesDelPeriodo(p)]);
  const { desde, hasta, salaId, tipo, agruparPor } = p;
  return { data, meta: { parametros: { desde, hasta, salaId, tipo, agruparPor }, totales } };
}

export type ReporteSuministros = Awaited<ReturnType<typeof reporteSuministros>>;
