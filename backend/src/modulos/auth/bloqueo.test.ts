import request from 'supertest';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import {
  CONTRASENA,
  crearUsuario,
  obtenerApp,
  prepararBaseConSeguridad,
} from '../../../tests/soporte/sesion';

const login = (nombreUsuario: string, contrasena: string) =>
  request(obtenerApp()).post('/api/auth/login').send({ nombreUsuario, contrasena });

const inicio = new Date('2026-10-07T10:00:00Z');
const despues = (min: number) => new Date(inicio.getTime() + min * 60_000);

describe('bloqueo por intentos fallidos (T112 · CU06 excepciones)', () => {
  let ahora: jest.SpyInstance<Date, []>;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    ahora = jest.spyOn(reloj, 'ahora').mockReturnValue(inicio);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const fallar = async (usuario: string, veces: number) => {
    let res;
    for (let i = 0; i < veces; i++) res = await login(usuario, 'Incorrecta1');
    return res!;
  };

  it('el tercer intento fallido bloquea la cuenta por 15 minutos', async () => {
    await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });

    expect((await fallar('sacosta', 2)).status).toBe(401);
    const tercero = await login('sacosta', 'Incorrecta1');

    expect(tercero.status).toBe(423);
    expect(tercero.body.error.codigo).toBe('CUENTA_BLOQUEADA');
    expect(tercero.body.error.detalles.bloqueadoHasta).toBe(
      despues(config.login.bloqueoMinutos).toISOString(),
    );
  });

  it('mientras está bloqueada no deja ingresar ni con la contraseña correcta', async () => {
    await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });
    await fallar('sacosta', 3);

    ahora.mockReturnValue(despues(config.login.bloqueoMinutos - 1));
    const res = await login('sacosta', CONTRASENA);
    expect(res.status).toBe(423);
    expect(res.body.error.mensaje).toMatch(/bloqueada/);
  });

  it('pasado el bloqueo vuelve a dejar ingresar', async () => {
    await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });
    await fallar('sacosta', 3);

    ahora.mockReturnValue(despues(config.login.bloqueoMinutos + 1));
    expect((await login('sacosta', CONTRASENA)).status).toBe(200);
  });

  it('un ingreso correcto reinicia el contador de intentos', async () => {
    await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });
    await fallar('sacosta', 2);
    expect((await login('sacosta', CONTRASENA)).status).toBe(200);

    expect((await fallar('sacosta', 2)).status).toBe(401);
  });

  it('notifica a los administradores y deja el bloqueo en la auditoría', async () => {
    const admin1 = await crearUsuario('ADMINISTRADOR');
    const admin2 = await crearUsuario('ADMINISTRADOR');
    await crearUsuario('ADMINISTRADOR', { activo: false });
    const u = await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });

    await fallar('sacosta', 3);

    const notificaciones = await prisma.notificacion.findMany({
      orderBy: { destinatarioId: 'asc' },
    });
    expect(notificaciones.map((n) => n.destinatarioId)).toEqual([admin1.id, admin2.id]);
    expect(notificaciones[0]).toMatchObject({ tipo: 'CUENTA_BLOQUEADA', leida: false });
    expect(notificaciones[0]?.mensaje).toMatch(/sacosta/);
    expect(
      await prisma.auditoria.count({
        where: { accion: 'BLOQUEAR_CUENTA', entidadId: String(u.id) },
      }),
    ).toBe(1);
  });

  it('los intentos con usuarios inexistentes no generan bloqueos ni notificaciones', async () => {
    await crearUsuario('ADMINISTRADOR');
    await fallar('nadie', 4);
    expect(await prisma.notificacion.count()).toBe(0);
  });
});
