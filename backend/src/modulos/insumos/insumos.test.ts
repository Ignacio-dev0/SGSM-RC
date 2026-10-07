import request from 'supertest';
import { prisma } from '../../db';
import { crearInsumo } from '../../../tests/soporte/fabricas';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

const nuevo = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Amoxicilina',
  tipo: 'MEDICAMENTO',
  unidadMedida: 'mg',
  presentacion: 'Cápsulas 500 mg',
  ...extra,
});

describe('catálogo de insumos y medicamentos (T303 · CU17 · CU21)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  it('lista el catálogo activo filtrando por tipo y texto, ordenado por nombre', async () => {
    const { agente } = await agenteConRol('ENFERMERO');
    await crearInsumo({ nombre: 'Paracetamol', presentacion: 'Comprimidos 500 mg' });
    await crearInsumo({ nombre: 'Ibuprofeno', presentacion: 'Comprimidos 400 mg' });
    await crearInsumo({ nombre: 'Gasa estéril', tipo: 'INSUMO', unidadMedida: 'unidad' });
    await crearInsumo({ nombre: 'Dipirona', activo: false });

    const medicamentos = await agente.get('/api/insumos').query({ tipo: 'MEDICAMENTO' });
    expect(medicamentos.status).toBe(200);
    expect(medicamentos.body.data.map((i: { nombre: string }) => i.nombre)).toEqual([
      'Ibuprofeno',
      'Paracetamol',
    ]);
    expect(medicamentos.body.data[0]).toMatchObject({
      tipo: 'MEDICAMENTO',
      unidadMedida: 'comprimido',
      presentacion: 'Comprimidos 400 mg',
      activo: true,
    });

    const porTexto = await agente.get('/api/insumos').query({ texto: 'gasa' });
    expect(porTexto.body.data.map((i: { nombre: string }) => i.nombre)).toEqual(['Gasa estéril']);
  });

  it('el administrador puede ver también los dados de baja', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    await crearInsumo({ nombre: 'Dipirona', activo: false });
    const res = await agente.get('/api/insumos').query({ activo: 'false' });
    expect(res.body.data.map((i: { nombre: string }) => i.nombre)).toEqual(['Dipirona']);
  });

  it('da de alta un insumo y lo audita', async () => {
    const { agente, usuario } = await agenteConRol('ADMINISTRADOR');

    const res = await agente.post('/api/insumos').send(nuevo());

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      nombre: 'Amoxicilina',
      tipo: 'MEDICAMENTO',
      activo: true,
    });
    expect(
      await prisma.auditoria.count({
        where: { accion: 'CREAR', entidad: 'Insumo', usuarioId: usuario.id },
      }),
    ).toBe(1);
  });

  it('rechaza el mismo nombre con la misma presentación', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    await agente.post('/api/insumos').send(nuevo());
    const res = await agente.post('/api/insumos').send(nuevo());
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INSUMO_DUPLICADO');
    expect(
      (await agente.post('/api/insumos').send(nuevo({ presentacion: 'Suspensión 250 mg/5 ml' })))
        .status,
    ).toBe(201);
  });

  it('valida tipo, nombre y unidad de medida', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    const res = await agente.post('/api/insumos').send({ tipo: 'OTRO' });
    expect(res.status).toBe(400);
    const campos = res.body.error.detalles.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['nombre', 'tipo', 'unidadMedida']));
  });

  it('modifica y da de baja un insumo sin borrarlo', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    const { body } = await agente.post('/api/insumos').send(nuevo());

    const mod = await agente
      .patch(`/api/insumos/${body.data.id}`)
      .send({ presentacion: 'Cápsulas 875 mg' });
    expect(mod.body.data.presentacion).toBe('Cápsulas 875 mg');

    const baja = await agente.delete(`/api/insumos/${body.data.id}`);
    expect(baja.status).toBe(200);
    expect(baja.body.data.activo).toBe(false);
    expect(await prisma.insumo.count()).toBe(1);
    const acciones = (await prisma.auditoria.findMany({ where: { entidad: 'Insumo' } })).map(
      (a) => a.accion,
    );
    expect(acciones).toEqual(['CREAR', 'MODIFICAR', 'BAJA']);
  });

  it.each(['MEDICO', 'ENFERMERO'] as const)(
    'el %s consulta pero no administra el catálogo',
    async (rol) => {
      const { agente } = await agenteConRol(rol);
      expect((await agente.get('/api/insumos')).status).toBe(200);
      expect((await agente.post('/api/insumos').send(nuevo())).status).toBe(403);
    },
  );

  it('sin sesión responde 401', async () => {
    expect((await request(obtenerApp()).get('/api/insumos')).status).toBe(401);
  });
});
