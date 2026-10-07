import { prisma } from '../../db';
import { crearCama, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Agente = Awaited<ReturnType<typeof agenteConRol>>['agente'];

describe('búsqueda de pacientes (T203 · CU12)', () => {
  let enfermero: Agente;
  let salaBId: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    const e = await agenteConRol('ENFERMERO');
    enfermero = e.agente;
    const uid = e.usuario.id;
    const a1 = await crearCama('Sala A', 'A-01');
    const b1 = await crearCama('Sala B', 'B-01');
    salaBId = b1.salaId;

    const internar = async (datos: Parameters<typeof crearPacienteBasico>[1], camaId: number) => {
      const p = await crearPacienteBasico(uid, datos);
      await prisma.asignacionCama.create({
        data: {
          pacienteId: p.id,
          camaId,
          motivo: 'INGRESO',
          fechaDesde: new Date(),
          asignadoPorId: uid,
        },
      });
      return p;
    };
    await internar({ apellido: 'Benítez', nombre: 'Rosa', dni: '30111222' }, a1.id);
    await internar({ apellido: 'Benítez', nombre: 'Juan', dni: '28555444' }, b1.id);
    await crearPacienteBasico(uid, {
      apellido: 'Gómez',
      nombre: 'Ana',
      dni: '30999000',
      estado: 'EGRESADO',
      fechaEgreso: new Date(),
      motivoEgreso: 'Alta médica',
    });
  });
  afterAll(() => prisma.$disconnect());

  const buscar = async (query: Record<string, string | number>) => {
    const res = await enfermero.get('/api/pacientes').query(query);
    expect(res.status).toBe(200);
    return res.body as {
      data: {
        apellido: string;
        nombre: string;
        cama: { numero: string; sala: { nombre: string } } | null;
      }[];
      meta: { total: number };
    };
  };
  const nombres = (r: Awaited<ReturnType<typeof buscar>>) =>
    r.data.map((p) => `${p.apellido}, ${p.nombre}`);

  it('busca por apellido sin importar mayúsculas y ordena por apellido y nombre', async () => {
    expect(nombres(await buscar({ texto: 'beni' }))).toEqual(['Benítez, Juan', 'Benítez, Rosa']);
  });

  it('busca sin importar las tildes', async () => {
    expect(nombres(await buscar({ texto: 'gomez' }))).toEqual(['Gómez, Ana']);
    expect(nombres(await buscar({ apellido: 'BENITEZ' }))).toHaveLength(2);
  });

  it('los comodines se buscan como texto literal', async () => {
    expect((await buscar({ texto: '%' })).data).toEqual([]);
    expect((await buscar({ texto: '_' })).data).toEqual([]);
  });

  it('busca por DNI desde el comienzo', async () => {
    expect(nombres(await buscar({ texto: '3011' }))).toEqual(['Benítez, Rosa']);
    expect(nombres(await buscar({ dni: '30999000' }))).toEqual(['Gómez, Ana']);
  });

  it('busca por número de cama y por sala', async () => {
    expect(nombres(await buscar({ cama: 'a-01' }))).toEqual(['Benítez, Rosa']);
    expect(nombres(await buscar({ salaId: salaBId }))).toEqual(['Benítez, Juan']);
  });

  it('filtra por estado', async () => {
    expect(nombres(await buscar({ estado: 'EGRESADO' }))).toEqual(['Gómez, Ana']);
    expect((await buscar({ estado: 'INTERNADO' })).meta.total).toBe(2);
  });

  it('cada fila trae la cama y la sala actual para mostrarlas en la grilla', async () => {
    const r = await buscar({ texto: 'Rosa' });
    expect(r.data[0]?.cama).toMatchObject({ numero: 'A-01', sala: { nombre: 'Sala A' } });
    const egresada = await buscar({ estado: 'EGRESADO' });
    expect(egresada.data[0]?.cama).toBeNull();
  });

  it('pagina los resultados', async () => {
    const r = await buscar({ porPagina: 2, pagina: 2 });
    expect(r.data).toHaveLength(1);
    expect(r.meta).toMatchObject({ total: 3, pagina: 2, porPagina: 2, totalPaginas: 2 });
  });
});
