import type { Prisma } from '@prisma/client';
import { azarSql as azar, elegirSql, elegirTextoSql } from './azar';
import { VOLUMEN } from './base';
import type { Catalogo, Personal } from './catalogo';
import { MOTIVOS_NO_ADMINISTRADO, OBSERVACIONES_SUMINISTRO } from './nombres';

/**
 * Tablas grandes del volumen (T702) en SQL dentro de la base: tomas de cada prescripción
 * (generate_series sobre su agenda), suministros con sus detalles, recordatorios y
 * notificaciones. El azar es un hash del número de fila (`azarSql`): reproducible y sin traer
 * filas a Node. Todo corre en la transacción del generador, con tablas temporales.
 */

type Tx = Prisma.TransactionClient;

/** Literal de un instante para el SQL (lo arma el script, nunca viene de afuera). */
export const instante = (d: Date) => `'${d.toISOString()}'::timestamptz`;

export async function ejecutar(tx: Tx, que: string, sql: string) {
  const t0 = performance.now();
  const filas = await tx.$executeRawUnsafe(sql);
  console.info(
    `  ${que}: ${filas.toLocaleString('es-AR')} filas en ${Math.round(performance.now() - t0)} ms`,
  );
  return filas;
}

async function numero(tx: Tx, sql: string): Promise<number> {
  const [fila] = await tx.$queryRawUnsafe<{ n: number | bigint | null }[]>(sql);
  return Number(fila?.n ?? 0);
}

/** Prioridad según lo que falta para la toma (S10): ALTA ≤ 5 min, MEDIA ≤ 15, si no BAJA. */
const prioridad = (falta: string) => `CASE WHEN ${falta} <= interval '5 minutes' THEN 'ALTA'
  WHEN ${falta} <= interval '15 minutes' THEN 'MEDIA' ELSE 'BAJA' END`;

/**
 * Cada toma de la agenda hasta 30 min después de ahora (T302), con su destino:
 * P = pendiente (ventana actual), D = administrada, N = "No se administró", V = vencida.
 */
async function tomas(tx: Tx, ahora: Date, personal: Personal) {
  const AHORA = instante(ahora);
  await ejecutar(
    tx,
    'Tomas de la agenda',
    `CREATE TEMP TABLE vol_tomas ON COMMIT DROP AS
     SELECT row_number() OVER (ORDER BY t, p.id)::bigint AS n, p.id AS prescripcion_id,
            p.paciente_id, p.insumo_id, p.dosis, pa.fecha_egreso AS egreso, t
     FROM prescripciones p
     JOIN pacientes pa ON pa.id = p.paciente_id
     CROSS JOIN LATERAL generate_series(
       p.fecha_inicio,
       LEAST(COALESCE(p.fecha_fin, 'infinity'), COALESCE(pa.fecha_egreso, 'infinity'),
             ${AHORA} + interval '30 minutes'),
       make_interval(hours => p.frecuencia_horas)) AS t`,
  );
  // Demora de la administración: casi siempre entre 20 min antes y 28 después; un 5 %, tarde.
  const demora = `CASE WHEN ${azar('n', 2)} < 0.05 THEN 31 + floor(${azar('n', 5)} * 120)::int
    ELSE -20 + floor(${azar('n', 5)} * 49)::int END`;
  await ejecutar(
    tx,
    'Destino de cada toma',
    `CREATE TEMP TABLE vol_tomas_c ON COMMIT DROP AS
     SELECT n, prescripcion_id, paciente_id, insumo_id, dosis, t,
       CASE WHEN t > ${AHORA} - interval '30 minutes' THEN 'P'
            WHEN ${azar('n', 1)} < ${VOLUMEN.adherencia} THEN 'D'
            WHEN ${azar('n', 3)} < 0.65 THEN 'N' ELSE 'V' END AS destino,
       LEAST(t + make_interval(mins => ${demora}), ${AHORA} - interval '1 minute',
             COALESCE(egreso, 'infinity')) AS fecha_dada,
       ${elegirSql(personal.enfermeros, 'n', 4)} AS usuario_id
     FROM vol_tomas`,
  );
  await tx.$executeRawUnsafe('CREATE INDEX ON vol_tomas_c (n)');
}

/** Suministros: uno por toma administrada y, hasta completar el total, movimientos de insumos. */
async function suministros(tx: Tx, ahora: Date, personal: Personal, catalogo: Catalogo) {
  const AHORA = instante(ahora);
  const medicamentos = await numero(
    tx,
    `SELECT count(*) AS n FROM vol_tomas_c WHERE destino = 'D'`,
  );
  const deInsumos = VOLUMEN.suministros - medicamentos;
  if (deInsumos < 0) {
    throw new Error(`Las tomas administradas (${medicamentos}) superan los suministros pedidos`);
  }
  console.info(
    `  Administraciones: ${medicamentos.toLocaleString('es-AR')} · movimientos de insumos: ${deInsumos.toLocaleString('es-AR')}`,
  );

  // Instante al azar de alguna estadía: cada estadía pesa lo que dura.
  await ejecutar(
    tx,
    'Estadías',
    `CREATE TEMP TABLE vol_estadias ON COMMIT DROP AS
     SELECT paciente_id, desde, segundos, sum(segundos) OVER (ORDER BY paciente_id) - segundos AS acum
     FROM (SELECT id AS paciente_id, fecha_ingreso AS desde,
                  extract(epoch FROM COALESCE(fecha_egreso, ${AHORA} - interval '30 minutes')
                                     - fecha_ingreso)::float8 AS segundos
           FROM pacientes) e`,
  );
  await tx.$executeRawUnsafe('CREATE INDEX ON vol_estadias (acum)');
  const total = await numero(tx, 'SELECT sum(segundos) AS n FROM vol_estadias');
  await ejecutar(
    tx,
    'Movimientos de insumos',
    `CREATE TEMP TABLE vol_insumos ON COMMIT DROP AS
     SELECT g, e.paciente_id, e.desde + make_interval(secs => x.r - e.acum) AS fecha_hora,
            ${elegirSql(personal.enfermeros, 'g', 16)} AS usuario_id,
            1 + (${azar('g', 12)} < 0.4)::int + (${azar('g', 13)} < 0.12)::int AS items
     FROM (SELECT g, ${azar('g', 11)} * ${total} AS r FROM generate_series(1, ${deInsumos}) g) x
     CROSS JOIN LATERAL (SELECT * FROM vol_estadias e WHERE e.acum <= x.r
                         ORDER BY e.acum DESC LIMIT 1) e`,
  );
  // Ids en orden cronológico, como los asigna la base real.
  await ejecutar(
    tx,
    'Orden de los suministros',
    `CREATE TEMP TABLE vol_sum ON COMMIT DROP AS
     SELECT row_number() OVER (ORDER BY fecha_hora, origen, clave)::int AS id, x.*
     FROM (SELECT 'M'::text AS origen, n AS clave, paciente_id, usuario_id, prescripcion_id,
                  fecha_dada AS fecha_hora, t AS toma, insumo_id, dosis AS cantidad, 1 AS items
           FROM vol_tomas_c WHERE destino = 'D'
           UNION ALL
           SELECT 'I', g, paciente_id, usuario_id, NULL::int, fecha_hora, NULL::timestamptz,
                  NULL::int, NULL::float8, items
           FROM vol_insumos) x`,
  );
  await tx.$executeRawUnsafe('CREATE INDEX ON vol_sum (origen, clave)');

  const corregido = `${azar('id', 22)} < 0.004`;
  await ejecutar(
    tx,
    'Suministros',
    `INSERT INTO suministros (id, paciente_id, usuario_id, tipo, prescripcion_id, fecha_hora,
       toma_programada, observaciones, validado_biometricamente, motivo_correccion, corregido_en,
       corregido_por_id, creado_en)
     SELECT id, paciente_id, usuario_id,
       (CASE origen WHEN 'M' THEN 'MEDICAMENTO' ELSE 'INSUMOS' END)::"TipoSuministro",
       prescripcion_id, fecha_hora, toma,
       CASE WHEN ${azar('id', 21)} < 0.03 THEN ${elegirTextoSql(OBSERVACIONES_SUMINISTRO, 'id', 24)} END,
       true,
       CASE WHEN ${corregido} THEN 'Cantidad mal cargada' END,
       CASE WHEN ${corregido} THEN LEAST(fecha_hora + make_interval(mins => 10 + floor(${azar('id', 23)} * 600)::int), ${AHORA}) END,
       CASE WHEN ${corregido} THEN usuario_id END,
       fecha_hora
     FROM vol_sum ORDER BY id`,
  );
  await ejecutar(
    tx,
    'Detalles de suministro',
    `INSERT INTO detalles_suministro (suministro_id, insumo_id, cantidad)
     SELECT suministro_id, insumo_id, cantidad FROM (
       SELECT id AS suministro_id, insumo_id, cantidad, 0 AS j FROM vol_sum WHERE origen = 'M'
       UNION ALL
       (SELECT DISTINCT ON (s.id, ins) s.id, ins, (1 + floor(${azar('s.clave * 4 + j', 15)} * 3))::float8, j
        FROM vol_sum s
        CROSS JOIN LATERAL generate_series(1, s.items) j
        CROSS JOIN LATERAL (SELECT ${elegirSql(catalogo.insumosPonderados, 's.clave * 4 + j', 14)} AS ins) z
        WHERE s.origen = 'I'
        ORDER BY s.id, ins, j)
     ) d ORDER BY suministro_id, j`,
  );
}

/**
 * Recordatorios de las tomas y los estudios más recientes (unos 150.000: el temporizador cubre
 * la última parte del año). Cada uno coherente con lo que pasó con la toma: atendido por la
 * administración (a tiempo o tarde, con `vencidoEn`), "No se administró", vencido o pendiente.
 */
async function recordatorios(tx: Tx, ahora: Date, personal: Personal) {
  const AHORA = instante(ahora);
  const estudiosConRecordatorio = `e.estado = 'REALIZADO'
    OR (e.estado = 'PROGRAMADO' AND e.fecha_hora <= ${AHORA} + interval '30 minutes')`;
  const [corte] = await tx.$queryRawUnsafe<{ t: Date }[]>(
    `SELECT t FROM (SELECT t FROM vol_tomas_c
                    UNION ALL SELECT e.fecha_hora FROM estudios e WHERE ${estudiosConRecordatorio}) x
     ORDER BY t DESC OFFSET ${VOLUMEN.recordatorios - 1} LIMIT 1`,
  );
  if (!corte) throw new Error('No hay tomas suficientes para los recordatorios');
  const CORTE = instante(corte.t);
  const media = `interval '30 minutes'`;
  await ejecutar(
    tx,
    'Recordatorios',
    `WITH med AS (
       SELECT c.n AS clave, c.paciente_id, c.prescripcion_id, c.t, c.destino, s.id AS suministro_id,
         CASE c.destino WHEN 'D' THEN s.fecha_hora
           WHEN 'N' THEN LEAST(c.t + make_interval(mins => -10 + floor(${azar('c.n', 31)} * 70)::int), ${AHORA})
         END AS atendido_en,
         CASE c.destino WHEN 'D' THEN s.usuario_id
           WHEN 'N' THEN ${elegirSql(personal.enfermeros, 'c.n', 32)} END AS atendido_por_id,
         CASE WHEN c.destino = 'N' THEN ${elegirTextoSql(MOTIVOS_NO_ADMINISTRADO, 'c.n', 33)} END AS motivo
       FROM vol_tomas_c c LEFT JOIN vol_sum s ON s.origen = 'M' AND s.clave = c.n
       WHERE c.t >= ${CORTE}
     ), todos AS (
       SELECT 'MEDICAMENTO' AS tipo, clave, paciente_id, prescripcion_id, NULL::int AS estudio_id,
         t AS objetivo,
         CASE destino WHEN 'P' THEN 'PENDIENTE' WHEN 'V' THEN 'VENCIDO' ELSE 'ATENDIDO' END AS estado,
         atendido_en, atendido_por_id, suministro_id, motivo,
         CASE WHEN destino = 'V' OR atendido_en > t + ${media} THEN t + ${media} END AS vencido_en,
         CASE destino WHEN 'P' THEN ${prioridad(`t - ${AHORA}`)} WHEN 'V' THEN 'ALTA'
           ELSE ${prioridad('t - atendido_en')} END AS prioridad
       FROM med
       UNION ALL
       SELECT 'ESTUDIO', e.id, e.paciente_id, NULL, e.id, e.fecha_hora,
         CASE e.estado WHEN 'REALIZADO' THEN 'ATENDIDO' ELSE 'PENDIENTE' END,
         e.realizado_en, e.confirmado_por_id, NULL, NULL,
         CASE WHEN e.realizado_en > e.fecha_hora + ${media} THEN e.fecha_hora + ${media} END,
         'MEDIA'
       FROM estudios e WHERE e.fecha_hora >= ${CORTE} AND (${estudiosConRecordatorio})
     )
     INSERT INTO recordatorios (id, tipo, paciente_id, prescripcion_id, estudio_id,
       fecha_hora_objetivo, generado_en, prioridad, estado, atendido_por_id, atendido_en,
       suministro_id, motivo_no_administrado, vencido_en)
     SELECT row_number() OVER (ORDER BY objetivo, tipo, clave), tipo::"TipoRecordatorio",
       paciente_id, prescripcion_id, estudio_id, objetivo, objetivo - ${media},
       prioridad::"PrioridadRecordatorio", estado::"EstadoRecordatorio", atendido_por_id,
       atendido_en, suministro_id, motivo, vencido_en
     FROM todos ORDER BY 1`,
  );
}

/** Cada vencido avisó a cada administrador (T508); las de más de un día ya se leyeron. */
async function notificaciones(tx: Tx, ahora: Date, personal: Personal) {
  const AHORA = instante(ahora);
  await ejecutar(
    tx,
    'Notificaciones',
    `INSERT INTO notificaciones (destinatario_id, tipo, mensaje, datos, leida, creada_en)
     SELECT a.id, 'RECORDATORIO_VENCIDO',
       left('Recordatorio vencido sin atender: ' || COALESCE(i.nombre, 'estudio ' || e.nombre)
            || ' de las ' || to_char(r.fecha_hora_objetivo AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI')
            || ' · ' || pa.apellido || ', ' || pa.nombre
            || COALESCE(' (' || sa.nombre || ', cama ' || ca.numero || ')', ''), 255),
       jsonb_build_object('recordatorioId', r.id, 'pacienteId', r.paciente_id,
         'fechaHoraObjetivo', to_char(r.fecha_hora_objetivo AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
       r.vencido_en < ${AHORA} - interval '1 day', r.vencido_en
     FROM recordatorios r
     JOIN pacientes pa ON pa.id = r.paciente_id
     LEFT JOIN prescripciones p ON p.id = r.prescripcion_id
     LEFT JOIN insumos i ON i.id = p.insumo_id
     LEFT JOIN estudios e ON e.id = r.estudio_id
     -- La cama (y su sala) en la que estaba cuando venció, como el aviso del ciclo.
     LEFT JOIN LATERAL (
       SELECT ac.cama_id FROM asignaciones_cama ac
       WHERE ac.paciente_id = r.paciente_id AND ac.fecha_desde <= r.vencido_en
         AND (ac.fecha_hasta IS NULL OR ac.fecha_hasta > r.vencido_en)
       ORDER BY ac.fecha_desde DESC LIMIT 1
     ) asig ON true
     LEFT JOIN camas ca ON ca.id = asig.cama_id
     LEFT JOIN salas sa ON sa.id = ca.sala_id
     CROSS JOIN unnest(ARRAY[${personal.administradores.join(',')}]) AS a(id)
     WHERE r.vencido_en IS NOT NULL
     ORDER BY r.vencido_en, r.id, a.id`,
  );
}

export async function crearMasivo(tx: Tx, ahora: Date, personal: Personal, catalogo: Catalogo) {
  await tomas(tx, ahora, personal);
  await suministros(tx, ahora, personal, catalogo);
  await recordatorios(tx, ahora, personal);
  await notificaciones(tx, ahora, personal);
}
