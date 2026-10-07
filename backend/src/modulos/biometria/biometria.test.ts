import request from 'supertest';
import { prisma } from '../../db';
import {
  agenteConRol,
  agenteDe,
  crearUsuario,
  obtenerApp,
  prepararBaseConSeguridad,
} from '../../../tests/soporte/sesion';

const patron = (valor = 0.05) => Array.from({ length: 128 }, (_, i) => valor + i / 10_000);
// PNG de 1 × 1 píxel: alcanza como foto de referencia para las pruebas.
const FOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('API de datos biométricos (T403 · CU07–CU09)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  it('registra el patrón y la foto de referencia de un enfermero', async () => {
    const { agente: admin } = await agenteConRol('ADMINISTRADOR');
    const enfermero = await crearUsuario('ENFERMERO');

    const res = await admin
      .put(`/api/biometria/usuarios/${enfermero.id}`)
      .send({ patron: patron(), foto: FOTO });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ usuarioId: enfermero.id, registrado: true });
    const dato = await prisma.datoBiometrico.findUniqueOrThrow({
      where: { usuarioId: enfermero.id },
    });
    expect(dato.patron).toHaveLength(128);
    expect(dato.fotoTipo).toBe('image/png');
    const sesion = await (await agenteDe(enfermero)).get('/api/auth/sesion');
    expect(sesion.body.data.tieneBiometria).toBe(true);
  });

  it('registrar y actualizar quedan en la auditoría sin el patrón ni la foto', async () => {
    const { agente: admin } = await agenteConRol('ADMINISTRADOR');
    const enfermero = await crearUsuario('ENFERMERO');
    await admin
      .put(`/api/biometria/usuarios/${enfermero.id}`)
      .send({ patron: patron(), foto: FOTO });
    await admin
      .put(`/api/biometria/usuarios/${enfermero.id}`)
      .send({ patron: patron(0.07), foto: FOTO });

    const registros = await prisma.auditoria.findMany({
      where: { entidad: 'DatoBiometrico' },
      orderBy: { id: 'asc' },
    });
    expect(registros.map((r) => r.accion)).toEqual(['REGISTRAR_BIOMETRIA', 'ACTUALIZAR_BIOMETRIA']);
    expect(JSON.stringify(registros)).not.toMatch(/0\.05|base64/);
  });

  it('devuelve la foto de referencia', async () => {
    const { agente: admin } = await agenteConRol('ADMINISTRADOR');
    const enfermero = await crearUsuario('ENFERMERO');
    await admin
      .put(`/api/biometria/usuarios/${enfermero.id}`)
      .send({ patron: patron(), foto: FOTO });

    const res = await admin.get(`/api/biometria/usuarios/${enfermero.id}/foto`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.body.length).toBeGreaterThan(10);
  });

  it('elimina los datos biométricos y lo audita', async () => {
    const { agente: admin } = await agenteConRol('ADMINISTRADOR');
    const enfermero = await crearUsuario('ENFERMERO');
    await admin
      .put(`/api/biometria/usuarios/${enfermero.id}`)
      .send({ patron: patron(), foto: FOTO });

    const res = await admin.delete(`/api/biometria/usuarios/${enfermero.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.registrado).toBe(false);
    expect(await prisma.datoBiometrico.count()).toBe(0);
    expect(await prisma.auditoria.count({ where: { accion: 'ELIMINAR_BIOMETRIA' } })).toBe(1);
    expect((await admin.get(`/api/biometria/usuarios/${enfermero.id}/foto`)).status).toBe(404);
    expect((await admin.delete(`/api/biometria/usuarios/${enfermero.id}`)).status).toBe(404);
  });

  it('lista el personal activo con el estado de su registro facial', async () => {
    const { agente: admin } = await agenteConRol('ADMINISTRADOR');
    const conRostro = await crearUsuario('ENFERMERO');
    await crearUsuario('MEDICO');
    await crearUsuario('ENFERMERO', { activo: false });
    await admin
      .put(`/api/biometria/usuarios/${conRostro.id}`)
      .send({ patron: patron(), foto: FOTO });

    const res = await admin.get('/api/biometria/usuarios');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.find((u: { id: number }) => u.id === conRostro.id)).toMatchObject({
      registrado: true,
      rol: 'Enfermero',
      actualizadoEn: expect.any(String),
    });
  });

  it('valida el patrón y la foto', async () => {
    const { agente: admin } = await agenteConRol('ADMINISTRADOR');
    const enfermero = await crearUsuario('ENFERMERO');

    const res = await admin
      .put(`/api/biometria/usuarios/${enfermero.id}`)
      .send({ patron: [0.1, 0.2], foto: 'no-es-una-imagen' });

    expect(res.status).toBe(400);
    const campos = res.body.error.detalles.map((d: { campo: string }) => d.campo);
    expect(campos).toEqual(expect.arrayContaining(['patron', 'foto']));
    expect(
      (await admin.put('/api/biometria/usuarios/999').send({ patron: patron(), foto: FOTO }))
        .status,
    ).toBe(404);
  });

  it.each(['MEDICO', 'ENFERMERO'] as const)('el %s no gestiona datos biométricos', async (rol) => {
    const { agente, usuario } = await agenteConRol(rol);
    expect((await agente.get('/api/biometria/usuarios')).status).toBe(403);
    expect(
      (
        await agente
          .put(`/api/biometria/usuarios/${usuario.id}`)
          .send({ patron: patron(), foto: FOTO })
      ).status,
    ).toBe(403);
  });

  it('sin sesión responde 401', async () => {
    expect((await request(obtenerApp()).get('/api/biometria/usuarios')).status).toBe(401);
  });
});
