import request from 'supertest';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import {
  CONTRASENA,
  agenteDe,
  crearUsuario,
  obtenerApp,
  prepararBaseConSeguridad,
} from '../../../tests/soporte/sesion';

const login = (nombreUsuario: string, contrasena: string) =>
  request(obtenerApp()).post('/api/auth/login').send({ nombreUsuario, contrasena });

describe('autenticación con usuario y contraseña (T105 · CU06 · RNF05)', () => {
  beforeEach(() => prepararBaseConSeguridad());
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  it('inicia sesión con credenciales válidas y deja la sesión en una cookie httpOnly', async () => {
    const u = await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });

    const res = await login('sacosta', CONTRASENA);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: u.id,
      nombreUsuario: 'sacosta',
      rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
    });
    expect(res.body.data.permisos).toContain('suministros.registrar');
    expect(res.body.data).not.toHaveProperty('contrasenaHash');
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^sgsm_sesion=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it('registra el inicio de sesión en la auditoría y la fecha de último acceso', async () => {
    const u = await crearUsuario('MEDICO', { nombreUsuario: 'mferreyra' });
    await login('mferreyra', CONTRASENA);

    const auditoria = await prisma.auditoria.findFirst({ where: { accion: 'INICIAR_SESION' } });
    expect(auditoria).toMatchObject({ usuarioId: u.id, entidad: 'Usuario' });
    const actualizado = await prisma.usuario.findUnique({ where: { id: u.id } });
    expect(actualizado?.ultimoAcceso).not.toBeNull();
  });

  it.each([
    ['contraseña incorrecta', 'sacosta', 'Otra2026'],
    ['usuario inexistente', 'nadie', CONTRASENA],
  ])('rechaza el ingreso con %s sin revelar qué dato falló', async (_caso, usuario, clave) => {
    await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });

    const res = await login(usuario, clave);

    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensaje: 'Usuario o contraseña incorrectos',
    });
  });

  it('no deja ingresar a un usuario dado de baja', async () => {
    await crearUsuario('ENFERMERO', { nombreUsuario: 'baja', activo: false });
    expect((await login('baja', CONTRASENA)).status).toBe(401);
  });

  it('exige usuario y contraseña', async () => {
    const res = await request(obtenerApp()).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
  });

  it('informa la sesión activa y la rechaza sin cookie', async () => {
    const u = await crearUsuario('ADMINISTRADOR');
    const agente = await agenteDe(u);

    const conSesion = await agente.get('/api/auth/sesion');
    expect(conSesion.status).toBe(200);
    expect(conSesion.body.data).toMatchObject({ id: u.id, rol: { codigo: 'ADMINISTRADOR' } });
    expect(conSesion.body.data.inactividadMinutos).toBe(config.sesion.inactividadMinutos);

    const sinSesion = await request(obtenerApp()).get('/api/auth/sesion');
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('cierra la sesión', async () => {
    const agente = await agenteDe(await crearUsuario('ENFERMERO'));

    const res = await agente.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect((await agente.get('/api/auth/sesion')).status).toBe(401);
    expect(await prisma.auditoria.count({ where: { accion: 'CERRAR_SESION' } })).toBe(1);
  });

  describe('cierre de sesión por inactividad', () => {
    const inicio = new Date('2026-10-07T10:00:00Z');
    const despues = (min: number) => new Date(inicio.getTime() + min * 60_000);
    const limite = config.sesion.inactividadMinutos;

    it('cierra la sesión si pasa el tiempo de inactividad sin pedidos', async () => {
      const u = await crearUsuario('ENFERMERO');
      const ahora = jest.spyOn(reloj, 'ahora').mockReturnValue(inicio);
      const agente = await agenteDe(u);

      ahora.mockReturnValue(despues(limite + 1));
      const res = await agente.get('/api/auth/sesion');

      expect(res.status).toBe(401);
      expect(res.body.error.mensaje).toMatch(/inactividad/);
    });

    it('cada pedido renueva la sesión (sesión deslizante)', async () => {
      const u = await crearUsuario('ENFERMERO');
      const ahora = jest.spyOn(reloj, 'ahora').mockReturnValue(inicio);
      const agente = await agenteDe(u);

      ahora.mockReturnValue(despues(limite - 2));
      expect((await agente.get('/api/auth/sesion')).status).toBe(200);
      ahora.mockReturnValue(despues(2 * limite - 4));
      expect((await agente.get('/api/auth/sesion')).status).toBe(200);
    });

    it('un usuario dado de baja pierde la sesión en el siguiente pedido', async () => {
      const u = await crearUsuario('ENFERMERO');
      const agente = await agenteDe(u);
      await prisma.usuario.update({ where: { id: u.id }, data: { activo: false } });

      expect((await agente.get('/api/auth/sesion')).status).toBe(401);
    });
  });
});
