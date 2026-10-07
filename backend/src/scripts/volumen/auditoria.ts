import type { Prisma } from '@prisma/client';
import { azarSql as azar, elegirSql } from './azar';
import { VOLUMEN } from './base';
import type { Personal } from './catalogo';
import { ejecutar, instante } from './masivo';

/**
 * Auditoría del volumen (T702): exactamente 600.000 entradas armadas a partir de lo que pasó en
 * el año (altas, camas, egresos, prescripciones, estudios, cada suministro, recordatorios
 * generados y vencidos, "No se administró"), con la forma que les da `registrarAuditoria`. Si
 * faltan, se completan con inicios de sesión; si sobran, se quitan los GENERAR más viejos. No
 * lleva el ATENDER de cada recordatorio: con él pasaría de 750.000 (ver docs/rendimiento.md).
 */

type Tx = Prisma.TransactionClient;

/** Instante en ISO 8601 UTC, como lo guarda `sanear()`. */
const iso = (columna: string) =>
  `to_char(${columna} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Cada fila: (fecha, usuario, acción, entidad, id, paciente, anterior, nuevo, detalle, orden, clave). */
const EVENTOS: [string, string][] = [
  [
    'Altas de pacientes',
    `SELECT fecha_ingreso, creado_por_id, 'CREAR', 'Paciente', id::text, id, NULL::jsonb,
       jsonb_build_object('dni', dni, 'nombre', nombre, 'apellido', apellido,
         'fechaNacimiento', to_char(fecha_nacimiento, 'YYYY-MM-DD'), 'sexo', sexo,
         'obraSocial', obra_social, 'numeroAfiliado', numero_afiliado, 'diagnostico', diagnostico,
         'estado', 'INTERNADO', 'fechaIngreso', ${iso('fecha_ingreso')}), NULL, 1, id
     FROM pacientes`,
  ],
  [
    'Asignaciones de cama',
    `SELECT a.fecha_desde, a.asignado_por_id, 'ASIGNAR_CAMA', 'AsignacionCama', a.id::text,
       a.paciente_id, NULL::jsonb,
       jsonb_build_object('cama', s.nombre || ' · ' || c.numero, 'motivo', a.motivo), NULL, 2, a.id
     FROM asignaciones_cama a JOIN camas c ON c.id = a.cama_id JOIN salas s ON s.id = c.sala_id`,
  ],
  [
    'Egresos',
    `SELECT fecha_egreso, creado_por_id, 'EGRESAR', 'Paciente', id::text, id,
       jsonb_build_object('estado', 'INTERNADO'),
       jsonb_build_object('estado', 'EGRESADO', 'fechaEgreso', ${iso('fecha_egreso')},
         'motivoEgreso', motivo_egreso), motivo_egreso, 3, id
     FROM pacientes WHERE fecha_egreso IS NOT NULL`,
  ],
  [
    'Camas liberadas',
    `SELECT fecha_hasta, liberado_por_id, 'LIBERAR_CAMA', 'AsignacionCama', id::text, paciente_id,
       NULL::jsonb, jsonb_build_object('fechaHasta', ${iso('fecha_hasta')}), NULL, 4, id
     FROM asignaciones_cama WHERE fecha_hasta IS NOT NULL`,
  ],
  [
    'Prescripciones',
    `SELECT p.creado_en, p.prescriptor_id, 'CREAR', 'Prescripcion', p.id::text, p.paciente_id,
       NULL::jsonb,
       jsonb_build_object('medicamento', i.nombre || ' ' || i.presentacion, 'dosis', p.dosis,
         'unidadDosis', p.unidad_dosis, 'frecuenciaHoras', p.frecuencia_horas, 'via', p.via,
         'fechaInicio', ${iso('p.fecha_inicio')}, 'fechaFin', ${iso('p.fecha_fin')},
         'observaciones', p.observaciones, 'estado', 'VIGENTE'), NULL, 5, p.id
     FROM prescripciones p JOIN insumos i ON i.id = p.insumo_id`,
  ],
  [
    'Prescripciones finalizadas o suspendidas',
    `SELECT p.actualizado_en, p.prescriptor_id,
       CASE p.estado WHEN 'FINALIZADA' THEN 'FINALIZAR' ELSE 'SUSPENDER' END, 'Prescripcion',
       p.id::text, p.paciente_id, jsonb_build_object('estado', 'VIGENTE'),
       jsonb_build_object('estado', p.estado, 'motivoCambioEstado', p.motivo_cambio_estado),
       NULL, 6, p.id
     FROM prescripciones p WHERE p.estado <> 'VIGENTE'`,
  ],
  [
    'Estudios programados',
    `SELECT creado_en, creado_por_id, 'PROGRAMAR', 'Estudio', id::text, paciente_id, NULL::jsonb,
       jsonb_build_object('nombre', nombre, 'fechaHora', ${iso('fecha_hora')}, 'preparacion', preparacion),
       NULL, 7, id
     FROM estudios`,
  ],
  [
    'Estudios confirmados o cancelados',
    `SELECT actualizado_en, COALESCE(confirmado_por_id, creado_por_id),
       CASE estado WHEN 'REALIZADO' THEN 'CONFIRMAR' ELSE 'CANCELAR' END, 'Estudio', id::text,
       paciente_id, jsonb_build_object('estado', 'PROGRAMADO'),
       jsonb_build_object('estado', estado), motivo_cancelacion, 8, id
     FROM estudios WHERE estado <> 'PROGRAMADO'`,
  ],
  [
    'Suministros registrados',
    `SELECT s.fecha_hora, s.usuario_id, 'REGISTRAR', 'Suministro', s.id::text, s.paciente_id,
       NULL::jsonb,
       jsonb_build_object('tipo', s.tipo, 'detalles', d.texto, 'prescripcionId', s.prescripcion_id,
         'validadoBiometricamente', true), NULL, 9, s.id
     FROM suministros s
     JOIN (SELECT ds.suministro_id, string_agg(i.nombre || ' × ' || ds.cantidad, ', ' ORDER BY ds.id) AS texto
           FROM detalles_suministro ds JOIN insumos i ON i.id = ds.insumo_id
           GROUP BY ds.suministro_id) d ON d.suministro_id = s.id`,
  ],
  [
    'Suministros corregidos',
    `SELECT corregido_en, corregido_por_id, 'CORREGIR', 'Suministro', id::text, paciente_id,
       jsonb_build_object('observaciones', NULL), jsonb_build_object('observaciones', motivo_correccion),
       motivo_correccion, 10, id
     FROM suministros WHERE corregido_en IS NOT NULL`,
  ],
  [
    'Recordatorios generados',
    `SELECT generado_en, NULL::int, 'GENERAR', 'Recordatorio', id::text, paciente_id, NULL::jsonb,
       jsonb_strip_nulls(jsonb_build_object('tipo', tipo, 'prescripcionId', prescripcion_id,
         'estudioId', estudio_id, 'fechaHoraObjetivo', ${iso('fecha_hora_objetivo')},
         'prioridad', 'BAJA')), NULL, 11, id
     FROM recordatorios`,
  ],
  [
    'Recordatorios vencidos',
    `SELECT vencido_en, NULL::int, 'VENCER', 'Recordatorio', id::text, paciente_id,
       jsonb_build_object('estado', 'PENDIENTE'),
       jsonb_build_object('estado', 'VENCIDO', 'vencidoEn', ${iso('vencido_en')}), NULL, 12, id
     FROM recordatorios WHERE vencido_en IS NOT NULL`,
  ],
  [
    '"No se administró"',
    `SELECT atendido_en, atendido_por_id, 'NO_ADMINISTRAR', 'Recordatorio', id::text, paciente_id,
       jsonb_build_object('estado', 'PENDIENTE'),
       jsonb_build_object('estado', 'ATENDIDO', 'motivoNoAdministrado', motivo_no_administrado),
       motivo_no_administrado, 13, id
     FROM recordatorios WHERE motivo_no_administrado IS NOT NULL`,
  ],
];

export async function crearAuditoria(tx: Tx, inicio: Date, ahora: Date, personal: Personal) {
  await tx.$executeRawUnsafe(
    `CREATE TEMP TABLE vol_aud (fecha_hora timestamptz, usuario_id int, accion text, entidad text,
       entidad_id text, paciente_id int, valor_anterior jsonb, valor_nuevo jsonb, detalle text,
       orden int, clave bigint) ON COMMIT DROP`,
  );
  for (const [que, sql] of EVENTOS)
    await ejecutar(tx, `Auditoría · ${que}`, `INSERT INTO vol_aud ${sql}`);

  const [fila] = await tx.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*) AS n FROM vol_aud');
  const diferencia = VOLUMEN.auditoria - Number(fila?.n ?? 0);
  if (diferencia > 0) {
    const todos = [...personal.administradores, ...personal.medicos, ...personal.enfermeros];
    const usuario = elegirSql(todos, 'g', 42);
    const segundos = (ahora.getTime() - inicio.getTime()) / 1000;
    await ejecutar(
      tx,
      'Auditoría · inicios de sesión para completar',
      `INSERT INTO vol_aud
       SELECT ${instante(inicio)} + make_interval(secs => ${azar('g', 41)} * ${segundos}), u, 'INICIAR_SESION',
         'Usuario', u::text, NULL, NULL, NULL, NULL, 14, g
       FROM (SELECT g, ${usuario} AS u FROM generate_series(1, ${diferencia}) g) x`,
    );
  } else if (diferencia < 0) {
    await ejecutar(
      tx,
      'Auditoría · GENERAR más viejos que sobran',
      `DELETE FROM vol_aud WHERE ctid IN (SELECT ctid FROM vol_aud WHERE accion = 'GENERAR'
         ORDER BY fecha_hora, clave LIMIT ${-diferencia})`,
    );
  }
  await ejecutar(
    tx,
    'Auditoría',
    `INSERT INTO auditoria (id, usuario_id, fecha_hora, accion, entidad, entidad_id, paciente_id,
       valor_anterior, valor_nuevo, detalle)
     SELECT row_number() OVER (ORDER BY fecha_hora, orden, clave), usuario_id, fecha_hora, accion,
       entidad, entidad_id, paciente_id, valor_anterior, valor_nuevo, left(detalle, 255)
     FROM vol_aud ORDER BY fecha_hora, orden, clave`,
  );
}
