import { prisma } from '../../db';
import {
  PERIODO,
  sembrarDatosDeReportes,
  type DatosDeReportes,
} from '../../../tests/soporte/reportes';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Agente = Awaited<ReturnType<typeof agenteConRol>>['agente'];

/** Estadísticas del período (T602 · CU33), contra los datos armados a mano (T608). */
describe('estadísticas (T602 · T608)', () => {
  let admin: Agente;
  let datos: DatosDeReportes;

  beforeAll(async () => {
    await prepararBaseConSeguridad();
    admin = (await agenteConRol('ADMINISTRADOR')).agente;
    datos = await sembrarDatosDeReportes();
  });
  afterAll(() => prisma.$disconnect());

  const estadisticas = async (query: Record<string, string | number> = {}) => {
    const res = await admin.get('/api/reportes/estadisticas').query({ ...PERIODO, ...query });
    expect(res.status).toBe(200);
    return res.body;
  };

  it('totales: suministros (medicamentos e insumos) y pacientes atendidos', async () => {
    const { data, meta } = await estadisticas();
    expect(data.totales).toEqual({ suministros: 8, medicamentos: 3, insumos: 5, pacientes: 3 });
    expect(meta).toEqual({
      parametros: { desde: '2026-10-01', hasta: '2026-10-07', salaId: null, tipo: null },
      dias: 7,
    });
  });

  it('los insumos más usados: por cantidad de suministros, como mucho 10', async () => {
    const { data } = await estadisticas();
    const { gasa, panal, paracetamol } = datos.insumos;
    expect(data.insumosMasUsados).toEqual([
      {
        insumoId: panal.id,
        nombre: 'Pañal para adultos',
        presentacion: 'Paquete x 10',
        tipo: 'INSUMO',
        suministros: 4,
      },
      // Paracetamol en mg y en comprimidos es el mismo medicamento: 3 suministros.
      expect.objectContaining({ insumoId: paracetamol.id, suministros: 3, tipo: 'MEDICAMENTO' }),
      expect.objectContaining({ insumoId: gasa.id, suministros: 2 }),
    ]);
  });

  it('el consumo por tipo trae siempre los dos tipos', async () => {
    expect((await estadisticas()).data.consumoPorTipo).toEqual([
      { tipo: 'MEDICAMENTO', suministros: 3 },
      { tipo: 'INSUMO', suministros: 5 },
    ]);
    expect((await estadisticas({ tipo: 'INSUMO' })).data.consumoPorTipo).toEqual([
      { tipo: 'MEDICAMENTO', suministros: 0 },
      { tipo: 'INSUMO', suministros: 5 },
    ]);
  });

  it('la evolución diaria tiene un punto por día del rango, también los días en cero', async () => {
    const { data } = await estadisticas();
    expect(data.evolucionDiaria).toEqual([
      { fecha: '2026-10-01', suministros: 1, medicamentos: 0, insumos: 1 },
      { fecha: '2026-10-02', suministros: 3, medicamentos: 2, insumos: 1 },
      { fecha: '2026-10-03', suministros: 2, medicamentos: 1, insumos: 1 },
      { fecha: '2026-10-04', suministros: 1, medicamentos: 0, insumos: 1 },
      { fecha: '2026-10-05', suministros: 0, medicamentos: 0, insumos: 0 },
      { fecha: '2026-10-06', suministros: 1, medicamentos: 0, insumos: 1 },
      { fecha: '2026-10-07', suministros: 0, medicamentos: 0, insumos: 0 },
    ]);
  });

  it('recordatorios del período: a tiempo, tarde, no administrados, vencidos y porcentaje (S20)', async () => {
    const { data } = await estadisticas();
    expect(data.recordatorios).toEqual({
      total: 6,
      aTiempo: 2,
      tarde: 1,
      noAdministrados: 1,
      vencidosSinAtender: 1,
      pendientes: 1,
      atendidos: 4,
      // 4 atendidos de 5 que ya tuvieron que atenderse (el pendiente todavía no cuenta).
      porcentajeAtendido: 80,
    });
  });

  it('con sala: suministros y recordatorios de quienes estaban en esa sala en ese momento', async () => {
    const a = await estadisticas({ salaId: datos.salas.a });
    expect(a.data.totales).toEqual({ suministros: 4, medicamentos: 2, insumos: 2, pacientes: 2 });
    expect(a.data.recordatorios).toMatchObject({
      total: 2,
      aTiempo: 1,
      tarde: 1,
      porcentajeAtendido: 100,
    });

    const b = await estadisticas({ salaId: datos.salas.b });
    expect(b.data.totales).toEqual({ suministros: 4, medicamentos: 1, insumos: 3, pacientes: 2 });
    expect(b.data.recordatorios).toEqual({
      total: 4,
      aTiempo: 1,
      tarde: 0,
      noAdministrados: 1,
      vencidosSinAtender: 1,
      pendientes: 1,
      atendidos: 2,
      porcentajeAtendido: 66.7,
    });
  });

  it('sin nada en el período: ceros, días en cero y porcentaje null', async () => {
    const { data } = await estadisticas({ desde: '2026-08-01', hasta: '2026-08-03' });
    expect(data.totales).toEqual({ suministros: 0, medicamentos: 0, insumos: 0, pacientes: 0 });
    expect(data.insumosMasUsados).toEqual([]);
    expect(data.evolucionDiaria).toHaveLength(3);
    expect(data.recordatorios).toMatchObject({ total: 0, porcentajeAtendido: null });
  });

  it('el top se corta en 10 insumos', async () => {
    const extra = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        prisma.insumo.create({
          data: { nombre: `Extra ${i}`, tipo: 'INSUMO', unidadMedida: 'unidad' },
        }),
      ),
    );
    const s = await prisma.suministro.create({
      data: {
        pacienteId: datos.pacientes.ana.id,
        usuarioId: datos.usuarios.sofia.id,
        tipo: 'INSUMOS',
        fechaHora: new Date('2026-09-15T12:00:00Z'),
        detalles: { create: extra.map((i) => ({ insumoId: i.id, cantidad: 1 })) },
      },
    });
    const { data } = await estadisticas({ desde: '2026-09-15', hasta: '2026-09-15' });
    expect(data.insumosMasUsados).toHaveLength(10);
    await prisma.suministro.delete({ where: { id: s.id } });
    await prisma.insumo.deleteMany({ where: { id: { in: extra.map((i) => i.id) } } });
  });

  it.each([
    ['MEDICO', 200],
    ['ENFERMERO', 403],
  ] as const)('el %s ve las estadísticas: %i (S17)', async (rol, estado) => {
    const { agente } = await agenteConRol(rol);
    expect((await agente.get('/api/reportes/estadisticas')).status).toBe(estado);
  });
});
