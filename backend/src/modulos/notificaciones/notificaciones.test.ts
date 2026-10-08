import request from 'supertest';
import { prisma } from '../../db';
import { agenteConRol, obtenerApp, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { notificarAdministradores } from './notificaciones.servicio';

describe('notificaciones del administrador (T112 · T407)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterAll(() => prisma.$disconnect());

  it('cada usuario ve solo sus notificaciones, las no leídas primero', async () => {
    const { agente, usuario } = await agenteConRol('ADMINISTRADOR');
    await notificarAdministradores(prisma, { tipo: 'CUENTA_BLOQUEADA', mensaje: 'Primera' });
    await notificarAdministradores(prisma, { tipo: 'CUENTA_BLOQUEADA', mensaje: 'Segunda' });
    const [primera] = await prisma.notificacion.findMany({ orderBy: { id: 'asc' } });
    await prisma.notificacion.update({ where: { id: primera!.id }, data: { leida: true } });

    const res = await agente.get('/api/notificaciones');

    expect(res.status).toBe(200);
    expect(res.body.data.map((n: { mensaje: string }) => n.mensaje)).toEqual([
      'Segunda',
      'Primera',
    ]);
    expect(res.body.meta.noLeidas).toBe(1);
    expect(
      res.body.data.every((n: { destinatarioId: number }) => n.destinatarioId === usuario.id),
    ).toBe(true);
  });

  it('marca una notificación propia como leída', async () => {
    const { agente } = await agenteConRol('ADMINISTRADOR');
    await notificarAdministradores(prisma, { tipo: 'CUENTA_BLOQUEADA', mensaje: 'Aviso' });
    const n = await prisma.notificacion.findFirstOrThrow();

    const res = await agente.patch(`/api/notificaciones/${n.id}/leida`);

    expect(res.status).toBe(200);
    expect(res.body.data.leida).toBe(true);
  });

  it('marca como leídas todas las propias de una vez y dice cuántas (D115)', async () => {
    const { agente, usuario } = await agenteConRol('ADMINISTRADOR');
    const otro = await agenteConRol('ADMINISTRADOR');
    for (const mensaje of ['Uno', 'Dos', 'Tres']) {
      await notificarAdministradores(prisma, { tipo: 'CUENTA_BLOQUEADA', mensaje });
    }
    const [primera] = await prisma.notificacion.findMany({
      where: { destinatarioId: usuario.id },
      orderBy: { id: 'asc' },
    });
    await prisma.notificacion.update({ where: { id: primera!.id }, data: { leida: true } });

    const res = await agente.post('/api/notificaciones/leer-todas');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { marcadas: 2 } });
    expect((await agente.get('/api/notificaciones')).body.meta.noLeidas).toBe(0);
    // Las del otro administrador quedan como estaban.
    expect((await otro.agente.get('/api/notificaciones')).body.meta.noLeidas).toBe(3);
    expect((await agente.post('/api/notificaciones/leer-todas')).body.data.marcadas).toBe(0);
  });

  it('cualquier usuario con sesión marca las suyas; sin sesión, 401', async () => {
    const { agente } = await agenteConRol('ENFERMERO');
    expect((await agente.post('/api/notificaciones/leer-todas')).body).toEqual({
      data: { marcadas: 0 },
    });
    expect((await request(obtenerApp()).post('/api/notificaciones/leer-todas')).status).toBe(401);
  });

  it('no permite marcar notificaciones de otro usuario', async () => {
    await agenteConRol('ADMINISTRADOR');
    await notificarAdministradores(prisma, { tipo: 'CUENTA_BLOQUEADA', mensaje: 'Ajena' });
    const ajena = await prisma.notificacion.findFirstOrThrow();
    const { agente: enfermero } = await agenteConRol('ENFERMERO');

    expect((await enfermero.patch(`/api/notificaciones/${ajena.id}/leida`)).status).toBe(404);
    expect((await enfermero.get('/api/notificaciones')).body.data).toEqual([]);
  });
});
