import { prisma } from '../../db';
import { inicioDelDia } from '../../comun/fechas';
import { reloj } from '../../comun/reloj';
import {
  PERIODO,
  sembrarDatosDeReportes,
  type DatosDeReportes,
} from '../../../tests/soporte/reportes';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Agente = Awaited<ReturnType<typeof agenteConRol>>['agente'];

/** Reporte de suministros agrupado con totales (T601 · CU32), contra datos armados a mano (T608). */
describe('reporte de suministros (T601 · T608)', () => {
  let admin: Agente;
  let datos: DatosDeReportes;

  beforeAll(async () => {
    await prepararBaseConSeguridad();
    admin = (await agenteConRol('ADMINISTRADOR')).agente;
    datos = await sembrarDatosDeReportes();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const reporte = async (query: Record<string, string | number> = {}, agente = admin) => {
    const res = await agente.get('/api/reportes/suministros').query({ ...PERIODO, ...query });
    expect(res.status).toBe(200);
    return res.body;
  };
  const filas = (body: { data: { etiqueta: string; suministros: number; unidades: number }[] }) =>
    body.data.map((f) => [f.etiqueta, f.suministros, f.unidades]);

  it('por paciente: "Apellido, Nombre", cantidad de suministros y unidades, con el total', async () => {
    const body = await reporte({ agruparPor: 'paciente' });
    expect(body.data).toEqual([
      {
        clave: String(datos.pacientes.ana.id),
        id: datos.pacientes.ana.id,
        etiqueta: 'Alvarez, Ana',
        suministros: 3,
        unidades: 1003,
        tipo: null,
        unidad: null,
      },
      expect.objectContaining({ etiqueta: 'Benítez, Beto', suministros: 3, unidades: 8 }),
      expect.objectContaining({ etiqueta: 'Castro, Carla', suministros: 2, unidades: 3 }),
    ]);
    expect(body.meta).toEqual({
      parametros: {
        desde: '2026-10-01',
        hasta: '2026-10-07',
        salaId: null,
        tipo: null,
        agruparPor: 'paciente',
      },
      totales: { suministros: 8, unidades: 1014 },
    });
  });

  it('por usuario: quien registró cada suministro', async () => {
    const body = await reporte({ agruparPor: 'usuario' });
    expect(filas(body)).toEqual([
      ['López, Lucas', 3, 504],
      ['Suárez, Sofía', 5, 510],
    ]);
    expect(body.data[0]).toMatchObject({ id: datos.usuarios.lucas.id, tipo: null, unidad: null });
    expect(body.meta.totales).toEqual({ suministros: 8, unidades: 1014 });
  });

  it('por insumo: con su tipo y la unidad en que se registró; no suma mg con comprimidos (D42)', async () => {
    const body = await reporte({ agruparPor: 'insumo' });
    const { gasa, panal, paracetamol } = datos.insumos;
    expect(body.data).toEqual([
      {
        clave: `${gasa.id}|unidad`,
        id: gasa.id,
        etiqueta: 'Gasa estéril · Sobre x 1',
        suministros: 2,
        unidades: 5,
        tipo: 'INSUMO',
        unidad: 'unidad',
      },
      expect.objectContaining({ id: panal.id, suministros: 4, unidades: 8, unidad: 'unidad' }),
      expect.objectContaining({
        clave: `${paracetamol.id}|comprimido`,
        etiqueta: 'Paracetamol · Comprimidos 500 mg',
        suministros: 1,
        unidades: 1,
        tipo: 'MEDICAMENTO',
        unidad: 'comprimido',
      }),
      expect.objectContaining({ clave: `${paracetamol.id}|mg`, suministros: 2, unidades: 1000 }),
    ]);
    // Un suministro con dos insumos cuenta en cada fila, pero una sola vez en el total (D43).
    expect(body.meta.totales).toEqual({ suministros: 8, unidades: 1014 });
  });

  it('por día en hora de Argentina: 23:30 cuenta en ese día y 00:30 en el siguiente', async () => {
    const body = await reporte({ agruparPor: 'dia' });
    expect(body.data).toEqual([
      {
        clave: '2026-10-01',
        id: null,
        etiqueta: '01/10/2026',
        suministros: 1,
        unidades: 4,
        tipo: null,
        unidad: null,
      },
      expect.objectContaining({ clave: '2026-10-02', suministros: 3, unidades: 1003 }),
      expect.objectContaining({ clave: '2026-10-03', suministros: 2, unidades: 4 }),
      expect.objectContaining({ clave: '2026-10-04', suministros: 1, unidades: 2 }),
      expect.objectContaining({ clave: '2026-10-06', suministros: 1, unidades: 1 }),
    ]);
  });

  it('los totales coinciden con lo que hay en la base para ese período (T608)', async () => {
    const enPeriodo = {
      fechaHora: { gte: inicioDelDia('2026-10-01'), lt: inicioDelDia('2026-10-08') },
    };
    const suministros = await prisma.suministro.count({ where: enPeriodo });
    const { _sum } = await prisma.detalleSuministro.aggregate({
      where: { suministro: enPeriodo },
      _sum: { cantidad: true },
    });
    for (const agruparPor of ['paciente', 'insumo', 'usuario', 'dia']) {
      const { meta } = await reporte({ agruparPor });
      expect(meta.totales).toEqual({ suministros, unidades: _sum.cantidad });
    }
    expect(suministros).toBe(8);
  });

  it('filtra por la sala en que estaba el paciente en ese momento (D41)', async () => {
    const a = await reporte({ salaId: datos.salas.a });
    expect(filas(a)).toEqual([
      ['Alvarez, Ana', 3, 1003],
      ['Castro, Carla', 1, 2],
    ]);
    expect(a.meta.totales).toEqual({ suministros: 4, unidades: 1005 });
    expect(a.meta.parametros.salaId).toBe(datos.salas.a);

    const b = await reporte({ salaId: datos.salas.b, agruparPor: 'dia' });
    expect(filas(b)).toEqual([
      ['01/10/2026', 1, 4],
      ['03/10/2026', 2, 4],
      ['06/10/2026', 1, 1],
    ]);
    expect(b.meta.totales).toEqual({ suministros: 4, unidades: 9 });
  });

  it('filtra por tipo de insumo', async () => {
    const insumos = await reporte({ tipo: 'INSUMO', agruparPor: 'insumo' });
    expect(filas(insumos)).toEqual([
      ['Gasa estéril · Sobre x 1', 2, 5],
      ['Pañal para adultos · Paquete x 10', 4, 8],
    ]);
    expect(insumos.meta.totales).toEqual({ suministros: 5, unidades: 13 });

    const medicamentos = await reporte({ tipo: 'MEDICAMENTO' });
    expect(filas(medicamentos)).toEqual([
      ['Alvarez, Ana', 2, 1000],
      ['Benítez, Beto', 1, 1],
    ]);
    expect(medicamentos.meta.totales).toEqual({ suministros: 3, unidades: 1001 });
  });

  it('un período sin suministros responde vacío con totales en cero', async () => {
    const body = await reporte({ desde: '2026-08-01', hasta: '2026-08-31' });
    expect(body.data).toEqual([]);
    expect(body.meta.totales).toEqual({ suministros: 0, unidades: 0 });
  });

  it('sin fechas usa los últimos 7 días hasta hoy en Argentina', async () => {
    jest.spyOn(reloj, 'ahora').mockReturnValue(new Date('2026-10-08T02:00:00Z'));
    // Sesión nueva con el reloj simulado (la otra vencería por inactividad).
    const { agente } = await agenteConRol('ADMINISTRADOR');
    const res = await agente.get('/api/reportes/suministros');
    expect(res.status).toBe(200);
    expect(res.body.meta.parametros).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-07' });
    expect(res.body.meta.totales.suministros).toBe(8);
  });

  it('una sala que no existe responde 404', async () => {
    const res = await admin.get('/api/reportes/suministros').query({ salaId: 9999 });
    expect(res.status).toBe(404);
    expect(res.body.error.mensaje).toBe('La sala no existe');
  });

  it('parámetros inválidos responden 400 con el campo', async () => {
    const res = await admin
      .get('/api/reportes/suministros')
      .query({ desde: '2025-01-01', hasta: '2026-10-07' });
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([
      { campo: 'desde', mensaje: 'El período puede tener hasta 366 días' },
    ]);
  });

  it.each([
    ['MEDICO', 200],
    ['ENFERMERO', 403],
  ] as const)('el %s ve el reporte: %i (S17)', async (rol, estado) => {
    const { agente } = await agenteConRol(rol);
    expect((await agente.get('/api/reportes/suministros')).status).toBe(estado);
  });

  it('un enfermero con el permiso adicional reportes.ver lo ve (CU05)', async () => {
    const { agente } = await agenteConRol('ENFERMERO', ['reportes.ver']);
    expect((await agente.get('/api/reportes/suministros')).status).toBe(200);
  });
});
