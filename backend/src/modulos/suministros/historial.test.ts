import request from 'supertest';
import { prisma } from '../../db';
import { crearInsumo, crearPacienteBasico } from '../../../tests/soporte/fabricas';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Agente = Awaited<ReturnType<typeof agenteConRol>>['agente'];

describe('historial de suministros (T411 · CU22 · RF10)', () => {
  let agente: Agente;
  let ana: number;
  let beto: number;
  let sofia: number;
  let lucas: number;
  let ids: Record<string, number>;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    const e1 = await agenteConRol('ENFERMERO');
    agente = e1.agente;
    sofia = e1.usuario.id;
    lucas = (await agenteConRol('ENFERMERO')).usuario.id;
    ana = (await crearPacienteBasico(sofia, { apellido: 'Ana' })).id;
    beto = (await crearPacienteBasico(sofia, { apellido: 'Beto' })).id;
    const paracetamol = await crearInsumo({ nombre: 'Paracetamol' });
    const gasa = await crearInsumo({ nombre: 'Gasa', tipo: 'INSUMO', unidadMedida: 'unidad' });

    const registrar = async (
      clave: string,
      datos: {
        pacienteId: number;
        usuarioId: number;
        fecha: string;
        insumoId: number;
        tipo: 'MEDICAMENTO' | 'INSUMOS';
      },
    ) => {
      const s = await prisma.suministro.create({
        data: {
          pacienteId: datos.pacienteId,
          usuarioId: datos.usuarioId,
          tipo: datos.tipo,
          fechaHora: new Date(datos.fecha),
          validadoBiometricamente: true,
          detalles: { create: [{ insumoId: datos.insumoId, cantidad: 1 }] },
        },
      });
      return [clave, s.id] as const;
    };
    ids = Object.fromEntries([
      await registrar('anaMed1', {
        pacienteId: ana,
        usuarioId: sofia,
        fecha: '2026-10-01T10:00:00Z',
        insumoId: paracetamol.id,
        tipo: 'MEDICAMENTO',
      }),
      await registrar('anaGasa', {
        pacienteId: ana,
        usuarioId: lucas,
        fecha: '2026-10-03T10:00:00Z',
        insumoId: gasa.id,
        tipo: 'INSUMOS',
      }),
      await registrar('betoMed', {
        pacienteId: beto,
        usuarioId: lucas,
        fecha: '2026-10-05T10:00:00Z',
        insumoId: paracetamol.id,
        tipo: 'MEDICAMENTO',
      }),
    ]);
  });
  afterAll(() => prisma.$disconnect());

  const buscar = async (query: Record<string, string | number> = {}) => {
    const res = await agente.get('/api/suministros').query(query);
    expect(res.status).toBe(200);
    return res.body as { data: { id: number }[]; meta: { total: number } };
  };
  const idsDe = (r: Awaited<ReturnType<typeof buscar>>) => r.data.map((s) => s.id);

  it('lista los suministros, los más recientes primero, con paginación', async () => {
    const r = await buscar();
    expect(idsDe(r)).toEqual([ids.betoMed, ids.anaGasa, ids.anaMed1]);
    expect(r.meta.total).toBe(3);
    expect(idsDe(await buscar({ porPagina: 1, pagina: 2 }))).toEqual([ids.anaGasa]);
  });

  it('filtra por paciente, período, tipo de insumo y responsable', async () => {
    expect(idsDe(await buscar({ pacienteId: ana }))).toEqual([ids.anaGasa, ids.anaMed1]);
    expect(
      idsDe(await buscar({ desde: '2026-10-02T00:00:00Z', hasta: '2026-10-04T00:00:00Z' })),
    ).toEqual([ids.anaGasa]);
    expect(idsDe(await buscar({ tipoInsumo: 'MEDICAMENTO' }))).toEqual([ids.betoMed, ids.anaMed1]);
    expect(idsDe(await buscar({ usuarioId: lucas, pacienteId: ana }))).toEqual([ids.anaGasa]);
  });

  it('cada registro trae paciente, responsable y detalle', async () => {
    const r = await agente.get(`/api/suministros/${ids.anaGasa}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      tipo: 'INSUMOS',
      paciente: { id: ana, apellido: 'Ana' },
      usuario: { id: lucas },
      detalles: [{ insumo: 'Gasa', cantidad: 1, unidad: 'unidad' }],
    });
    expect((await agente.get('/api/suministros/9999')).status).toBe(404);
  });

  it('lista los responsables que registraron suministros, para el filtro', async () => {
    const r = await agente.get('/api/suministros/responsables');
    expect(r.body.data.map((u: { id: number }) => u.id).sort()).toEqual([sofia, lucas].sort());
  });

  it.each(['ADMINISTRADOR', 'MEDICO', 'ENFERMERO'] as const)(
    'el %s puede consultar el historial',
    async (rol) => {
      const { agente: otro } = await agenteConRol(rol);
      expect((await otro.get('/api/suministros')).status).toBe(200);
    },
  );

  it('sin sesión responde 401', async () => {
    expect((await request(obtenerApp()).get('/api/suministros')).status).toBe(401);
  });
});
