import { prisma } from '../../src/db';

const TABLAS_DEL_DER = [
  'asignaciones_cama',
  'auditoria',
  'camas',
  'datos_biometricos',
  'detalles_suministro',
  'estudios',
  'insumos',
  'notificaciones',
  'pacientes',
  'permisos',
  'prescripciones',
  'recordatorios',
  'rol_permiso',
  'roles',
  'salas',
  'suministros',
  'tipos_estudio',
  'usuario_permiso',
  'usuarios',
];

describe('esquema de la base (T101)', () => {
  afterAll(() => prisma.$disconnect());

  it('las migraciones crean todas las tablas del DER', async () => {
    const filas = await prisma.$queryRaw<{ tabla: string }[]>`
      SELECT table_name AS tabla FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    expect(filas.map((f) => f.tabla)).toEqual(TABLAS_DEL_DER);
  });

  it('los reportes por período tienen índice por la fecha y hora del suministro (E6)', async () => {
    const filas = await prisma.$queryRaw<{ definicion: string }[]>`
      SELECT indexdef AS definicion FROM pg_indexes
      WHERE tablename = 'suministros' AND indexname = 'suministros_fecha_hora_idx'`;
    expect(filas).toHaveLength(1);
    expect(filas[0]?.definicion).toMatch(/\(fecha_hora\)$/);
  });

  it('los índices del volumen de un año (T702 · D71–D73, D101)', async () => {
    const filas = await prisma.$queryRaw<{ nombre: string; definicion: string }[]>`
      SELECT indexname AS nombre, indexdef AS definicion FROM pg_indexes
      WHERE tablename IN ('auditoria', 'detalles_suministro', 'suministros')`;
    const definicion = (nombre: string) => filas.find((f) => f.nombre === nombre)?.definicion;
    expect(definicion('detalles_suministro_suministro_id_idx')).toMatch(/\(suministro_id\)$/);
    expect(definicion('suministros_prescripcion_id_fecha_hora_idx')).toMatch(
      /\(prescripcion_id, fecha_hora\)$/,
    );
    expect(definicion('auditoria_accion_fecha_hora_id_idx')).toMatch(/\(accion, fecha_hora, id\)$/);
    // El de fecha_hora sola quedó reemplazado por el de (fecha_hora, id) (D72) y este, por el que
    // además lleva usuario_id para filtrar por origen sin leer la tabla (D101).
    expect(definicion('auditoria_fecha_hora_idx')).toBeUndefined();
    expect(definicion('auditoria_fecha_hora_id_idx')).toBeUndefined();
    expect(definicion('auditoria_fecha_hora_id_usuario_id_idx')).toMatch(
      /\(fecha_hora, id, usuario_id\)$/,
    );
  });
});
