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
});
