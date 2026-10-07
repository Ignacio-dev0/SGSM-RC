import { Prisma } from '@prisma/client';
import { noEncontrado } from '../../comun/errores';
import { ZONA_HORARIA, inicioDelDia, sumarDias } from '../../comun/fechas';
import { prisma } from '../../db';
import type { Periodo } from './reportes.esquemas';

/**
 * Piezas de SQL comunes a los reportes y las estadísticas (E6). Se agrega en la base, no en
 * memoria: un año de suministros de todo el hospital no se trae fila por fila.
 */

/** Límites del período en instantes: [00:00 de "desde", 00:00 del día siguiente a "hasta"). */
export const limites = ({ desde, hasta }: Pick<Periodo, 'desde' | 'hasta'>) => ({
  inicio: inicioDelDia(desde),
  fin: inicioDelDia(sumarDias(hasta, 1)),
});

/** Día 'AAAA-MM-DD' en Argentina de una columna timestamptz (S18). */
export const diaArgentino = (columna: Prisma.Sql) =>
  Prisma.sql`to_char(${columna} AT TIME ZONE ${ZONA_HORARIA}, 'YYYY-MM-DD')`;

/**
 * D41: el paciente estaba en una cama de la sala en ese instante (no la cama de hoy: un traslado
 * no mueve lo que ya se registró).
 */
export const enSala = (salaId: number, pacienteId: Prisma.Sql, instante: Prisma.Sql) => Prisma.sql`
  EXISTS (
    SELECT 1 FROM asignaciones_cama a JOIN camas c ON c.id = a.cama_id
    WHERE a.paciente_id = ${pacienteId} AND c.sala_id = ${salaId}
      AND a.fecha_desde <= ${instante} AND (a.fecha_hasta IS NULL OR a.fecha_hasta > ${instante})
  )`;

/**
 * CTE `lineas`: una fila por insumo de cada suministro del período, con los filtros aplicados.
 * La unidad es la de la prescripción si es un medicamento (como se registró) y si no la del
 * catálogo (D42). Un suministro corregido cuenta con lo corregido (S19): la corrección
 * reemplaza sus detalles.
 */
export function lineasDelPeriodo(p: Periodo) {
  const { inicio, fin } = limites(p);
  const tipo = p.tipo ? Prisma.sql`AND i.tipo = ${p.tipo}::"TipoInsumo"` : Prisma.empty;
  const sala = p.salaId
    ? Prisma.sql`AND ${enSala(p.salaId, Prisma.sql`s.paciente_id`, Prisma.sql`s.fecha_hora`)}`
    : Prisma.empty;
  return Prisma.sql`
    WITH lineas AS (
      SELECT s.id AS suministro_id, s.paciente_id, s.usuario_id, s.fecha_hora,
             d.insumo_id, d.cantidad, i.tipo::text AS tipo_insumo,
             COALESCE(pr.unidad_dosis, i.unidad_medida) AS unidad
      FROM suministros s
      JOIN detalles_suministro d ON d.suministro_id = s.id
      JOIN insumos i ON i.id = d.insumo_id
      LEFT JOIN prescripciones pr ON pr.id = s.prescripcion_id
      WHERE s.fecha_hora >= ${inicio} AND s.fecha_hora < ${fin} ${tipo} ${sala}
    )`;
}

/** La sala del filtro, si se indicó; 404 si no existe. */
export async function salaDelFiltro(salaId: number | null) {
  if (salaId === null) return null;
  const sala = await prisma.sala.findUnique({ where: { id: salaId } });
  if (!sala) throw noEncontrado('La sala no existe');
  return sala;
}

/** Las sumas de cantidades (Float) se redondean para no mostrar 0.30000000000000004. */
export const redondear = (n: number | null) => Math.round((n ?? 0) * 1000) / 1000;

/** Orden alfabético en español (Á junto a A, Ñ después de N). */
export const alfabetico = (a: string, b: string) => a.localeCompare(b, 'es');

export const nombreCompleto = (p: { apellido: string; nombre: string }) =>
  `${p.apellido}, ${p.nombre}`;
