import { prisma } from '../../db';
import { limpiarBase } from '../../../tests/soporte/base';
import { crearUsuarioBasico } from '../../../tests/soporte/fabricas';
import { prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { esquemaBusquedaAuditoria } from './auditoria.esquemas';
import { consultarAuditoria, opcionesDeAuditoria } from './consulta.servicio';

/**
 * Las consultas de la auditoría reescritas para el volumen de un año (T702 · docs/rendimiento.md)
 * devuelven lo mismo que antes: la página en dos pasos (D72) y las opciones saltando por el
 * índice (D73).
 */
describe('consulta de la auditoría con volumen (T702)', () => {
  const ACCIONES = ['REGISTRAR', 'GENERAR', 'CREAR', 'REGISTRAR', 'ATENDER'];
  // Con la intercalación de la base, Ñandú iría antes que Nube; en español va después.
  const ENTIDADES = ['Suministro', 'Ñandú', 'Nube', 'Oso', 'Suministro'];

  beforeAll(async () => {
    await prepararBaseConSeguridad();
    const persona = await crearUsuarioBasico();
    // 23 entradas, varias a la misma hora: el orden a igual hora es por id. Una de cada tres la
    // hizo el sistema (sin usuario).
    await prisma.auditoria.createMany({
      data: Array.from({ length: 23 }, (_, i) => ({
        fechaHora: new Date(Date.UTC(2021, 0, 1, Math.floor(i / 4))),
        accion: ACCIONES[i % ACCIONES.length]!,
        entidad: ENTIDADES[i % ENTIDADES.length]!,
        entidadId: String(i),
        usuarioId: i % 3 === 0 ? null : persona.id,
      })),
    });
  });
  afterAll(() => prisma.$disconnect());

  const consultar = (query: Record<string, unknown>) =>
    consultarAuditoria(esquemaBusquedaAuditoria.parse(query));

  /** Todas las páginas seguidas, para compararlas con el orden completo. */
  async function recorrer(query: Record<string, unknown>, tamano: number) {
    const ids: number[] = [];
    for (let pagina = 1; ; pagina++) {
      const r = await consultar({ ...query, pagina, tamano });
      ids.push(...r.data.map((e) => e.id));
      if (pagina >= r.meta.totalPaginas) return { ids, total: r.meta.total };
    }
  }

  it.each([1, 3, 7, 100])(
    'cada página de %i es el tramo que le toca del orden completo, también a igual hora (D72)',
    async (tamano) => {
      const completo = await prisma.auditoria.findMany({
        orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      expect(await recorrer({}, tamano)).toEqual({ ids: completo.map((e) => e.id), total: 23 });

      const registrar = await prisma.auditoria.findMany({
        where: { accion: 'REGISTRAR' },
        orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      expect(await recorrer({ accion: 'REGISTRAR' }, tamano)).toEqual({
        ids: registrar.map((e) => e.id),
        total: registrar.length,
      });
    },
  );

  it.each([
    ['personas', { usuarioId: { not: null } }],
    ['sistema', { usuarioId: null }],
  ] as const)(
    'por origen (%s), cada página es el tramo que le toca del orden completo (D101)',
    async (origen, where) => {
      const completo = await prisma.auditoria.findMany({
        where,
        orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      expect(completo.length).toBeGreaterThan(5);
      for (const tamano of [1, 3, 7, 100]) {
        expect(await recorrer({ origen }, tamano)).toEqual({
          ids: completo.map((e) => e.id),
          total: completo.length,
        });
      }
    },
  );

  it('cada fila de la página trae sus datos completos', async () => {
    const r = await consultar({ pagina: 2, tamano: 5 });
    const esperadas = await prisma.auditoria.findMany({
      orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
      skip: 5,
      take: 5,
    });
    expect(
      r.data.map(({ id, accion, entidad, entidadId, fechaHora }) => ({
        id,
        accion,
        entidad,
        entidadId,
        fechaHora,
      })),
    ).toEqual(
      esperadas.map(({ id, accion, entidad, entidadId, fechaHora }) => ({
        id,
        accion,
        entidad,
        entidadId,
        fechaHora,
      })),
    );
  });

  it('una página después de la última viene vacía y con el total', async () => {
    const r = await consultar({ pagina: 9, tamano: 5 });
    expect(r).toEqual({ data: [], meta: { pagina: 9, porPagina: 5, total: 23, totalPaginas: 5 } });
  });

  it('opciones: cada acción y entidad una sola vez, en orden alfabético español (D73)', async () => {
    expect(await opcionesDeAuditoria()).toEqual({
      acciones: ['ATENDER', 'CREAR', 'GENERAR', 'REGISTRAR'],
      entidades: ['Nube', 'Ñandú', 'Oso', 'Suministro'],
    });
  });

  it('opciones sin auditoría: listas vacías', async () => {
    await limpiarBase();
    expect(await opcionesDeAuditoria()).toEqual({ acciones: [], entidades: [] });
  });
});
