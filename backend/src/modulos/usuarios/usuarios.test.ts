import request from 'supertest';
import { prisma } from '../../db';
import { verificarContrasena } from '../auth/contrasenas';
import {
  agenteConRol,
  agenteDe,
  crearUsuario,
  obtenerApp,
  prepararBaseConSeguridad,
} from '../../../tests/soporte/sesion';

type Agente = Awaited<ReturnType<typeof agenteConRol>>['agente'];

const nuevo = (extra: Record<string, unknown> = {}) => ({
  nombreUsuario: 'lgomez',
  contrasena: 'Clave2026',
  dni: '30111222',
  nombre: 'Lucía',
  apellido: 'Gómez',
  email: 'lgomez@eldique.gob.ar',
  matricula: 'ME 2001',
  rol: 'ENFERMERO',
  ...extra,
});

describe('API de usuarios (T109 · CU01–CU05)', () => {
  let admin: Agente;
  let adminId: number;

  beforeEach(async () => {
    await prepararBaseConSeguridad();
    const a = await agenteConRol('ADMINISTRADOR');
    admin = a.agente;
    adminId = a.usuario.id;
  });
  afterAll(() => prisma.$disconnect());

  describe('alta (CU01)', () => {
    it('crea el usuario con la contraseña cifrada y lo devuelve sin ella', async () => {
      const res = await admin.post('/api/usuarios').send(nuevo());

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        nombreUsuario: 'lgomez',
        dni: '30111222',
        apellido: 'Gómez',
        rol: { codigo: 'ENFERMERO' },
        activo: true,
        tieneBiometria: false,
        permisosAdicionales: [],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/contrasena/i);
      const db = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'lgomez' } });
      expect(await verificarContrasena('Clave2026', db.contrasenaHash)).toBe(true);
    });

    it('queda en la auditoría sin la contraseña', async () => {
      const res = await admin.post('/api/usuarios').send(nuevo());
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'CREAR', entidad: 'Usuario' },
      });
      expect(a).toMatchObject({ usuarioId: adminId, entidadId: String(res.body.data.id) });
      expect(JSON.stringify(a.valorNuevo)).not.toMatch(/Clave2026/);
    });

    it('rechaza un DNI o un nombre de usuario repetidos', async () => {
      await admin.post('/api/usuarios').send(nuevo());

      const dni = await admin.post('/api/usuarios').send(nuevo({ nombreUsuario: 'otro' }));
      expect(dni.status).toBe(409);
      expect(dni.body.error.codigo).toBe('DNI_DUPLICADO');

      const usuario = await admin.post('/api/usuarios').send(nuevo({ dni: '30999888' }));
      expect(usuario.status).toBe(409);
      expect(usuario.body.error.codigo).toBe('USUARIO_DUPLICADO');
    });

    it('valida el formato de los datos', async () => {
      const res = await admin
        .post('/api/usuarios')
        .send(nuevo({ dni: '12ab', contrasena: 'corta', rol: 'DIRECTOR', email: 'no-es-mail' }));
      expect(res.status).toBe(400);
      const campos = res.body.error.detalles.map((d: { campo: string }) => d.campo);
      expect(campos).toEqual(expect.arrayContaining(['dni', 'contrasena', 'rol', 'email']));
    });
  });

  describe('búsqueda (CU02)', () => {
    beforeEach(async () => {
      await admin.post('/api/usuarios').send(nuevo());
      await admin
        .post('/api/usuarios')
        .send(
          nuevo({ nombreUsuario: 'rperez', dni: '28000111', apellido: 'Pérez', rol: 'MEDICO' }),
        );
    });

    it('filtra por texto (apellido, usuario o DNI) y por rol, con paginación', async () => {
      const porTexto = await admin.get('/api/usuarios').query({ texto: 'pérez' });
      expect(porTexto.body.data.map((u: { nombreUsuario: string }) => u.nombreUsuario)).toEqual([
        'rperez',
      ]);

      const porDni = await admin.get('/api/usuarios').query({ texto: '30111' });
      expect(porDni.body.data).toHaveLength(1);

      const porRol = await admin.get('/api/usuarios').query({ rol: 'MEDICO' });
      expect(porRol.body.data).toHaveLength(1);
      expect(porRol.body.meta).toMatchObject({ pagina: 1, total: 1 });
    });

    it('filtra por activos e inactivos', async () => {
      const lgomez = await prisma.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'lgomez' } });
      await admin.delete(`/api/usuarios/${lgomez.id}`);

      const inactivos = await admin.get('/api/usuarios').query({ activo: 'false' });
      expect(inactivos.body.data.map((u: { id: number }) => u.id)).toEqual([lgomez.id]);
    });

    it('devuelve el detalle con los permisos del rol y los adicionales', async () => {
      const u = await crearUsuario('ENFERMERO', { permisosAdicionales: ['pacientes.gestionar'] });
      const res = await admin.get(`/api/usuarios/${u.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.permisosDelRol).toContain('suministros.registrar');
      expect(res.body.data.permisosAdicionales).toEqual(['pacientes.gestionar']);
    });

    it('responde 404 si el usuario no existe', async () => {
      expect((await admin.get('/api/usuarios/9999')).status).toBe(404);
    });
  });

  describe('modificación (CU03)', () => {
    it('actualiza los datos y audita solo lo que cambió', async () => {
      const { body } = await admin.post('/api/usuarios').send(nuevo());

      const res = await admin
        .patch(`/api/usuarios/${body.data.id}`)
        .send({ apellido: 'Gómez Paz', rol: 'MEDICO' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ apellido: 'Gómez Paz', rol: { codigo: 'MEDICO' } });
      const a = await prisma.auditoria.findFirstOrThrow({ where: { accion: 'MODIFICAR' } });
      expect(a.valorAnterior).toEqual({ apellido: 'Gómez', rol: 'ENFERMERO' });
      expect(a.valorNuevo).toEqual({ apellido: 'Gómez Paz', rol: 'MEDICO' });
    });

    it('permite cambiar la contraseña y no la deja en la auditoría', async () => {
      const { body } = await admin.post('/api/usuarios').send(nuevo());
      await admin.patch(`/api/usuarios/${body.data.id}`).send({ contrasena: 'Nueva2026' });

      const db = await prisma.usuario.findUniqueOrThrow({ where: { id: body.data.id } });
      expect(await verificarContrasena('Nueva2026', db.contrasenaHash)).toBe(true);
      const a = await prisma.auditoria.findFirstOrThrow({ where: { accion: 'MODIFICAR' } });
      expect(JSON.stringify(a)).not.toMatch(/Nueva2026/);
    });

    it('no permite tomar el DNI de otro usuario', async () => {
      const { body } = await admin.post('/api/usuarios').send(nuevo());
      const otro = await crearUsuario('MEDICO');
      const res = await admin.patch(`/api/usuarios/${otro.id}`).send({ dni: body.data.dni });
      expect(res.status).toBe(409);
    });
  });

  describe('baja lógica (CU04)', () => {
    it('desactiva al usuario sin borrarlo y le impide ingresar', async () => {
      const u = await crearUsuario('ENFERMERO');
      const sesion = await agenteDe(u);

      const res = await admin.delete(`/api/usuarios/${u.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: u.id, activo: false });
      expect(res.body.data.fechaBaja).toEqual(expect.any(String));
      expect(await prisma.usuario.count({ where: { id: u.id } })).toBe(1);
      expect((await sesion.get('/api/auth/sesion')).status).toBe(401);
      expect(await prisma.auditoria.count({ where: { accion: 'BAJA', entidad: 'Usuario' } })).toBe(
        1,
      );
    });

    it('un administrador no puede darse de baja a sí mismo', async () => {
      const res = await admin.delete(`/api/usuarios/${adminId}`);
      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('BAJA_PROPIA');
    });

    it('no se puede dar de baja a un usuario ya inactivo', async () => {
      const u = await crearUsuario('ENFERMERO', { activo: false });
      expect((await admin.delete(`/api/usuarios/${u.id}`)).status).toBe(409);
    });
  });

  describe('permisos adicionales (CU05)', () => {
    it('reemplaza los permisos adicionales del usuario y lo audita', async () => {
      const u = await crearUsuario('ENFERMERO');

      const res = await admin
        .put(`/api/usuarios/${u.id}/permisos-adicionales`)
        .send({ permisos: ['pacientes.gestionar'] });

      expect(res.status).toBe(200);
      expect(res.body.data.permisosAdicionales).toEqual(['pacientes.gestionar']);
      const sesion = await (await agenteDe(u)).get('/api/auth/sesion');
      expect(sesion.body.data.permisos).toContain('pacientes.gestionar');
      const a = await prisma.auditoria.findFirstOrThrow({
        where: { accion: 'MODIFICAR_PERMISOS' },
      });
      expect(a.valorAnterior).toEqual({ permisosAdicionales: [] });
      expect(a.valorNuevo).toEqual({ permisosAdicionales: ['pacientes.gestionar'] });
    });

    it('ignora los permisos que el rol ya trae y rechaza los inexistentes', async () => {
      const u = await crearUsuario('ENFERMERO');
      const repetido = await admin
        .put(`/api/usuarios/${u.id}/permisos-adicionales`)
        .send({ permisos: ['suministros.registrar', 'pacientes.gestionar'] });
      expect(repetido.body.data.permisosAdicionales).toEqual(['pacientes.gestionar']);

      const inexistente = await admin
        .put(`/api/usuarios/${u.id}/permisos-adicionales`)
        .send({ permisos: ['volar.alto'] });
      expect(inexistente.status).toBe(400);
    });

    it('lista los roles y el catálogo de permisos', async () => {
      const roles = await admin.get('/api/roles');
      expect(roles.body.data.map((r: { codigo: string }) => r.codigo)).toEqual([
        'ADMINISTRADOR',
        'ENFERMERO',
        'MEDICO',
      ]);
      const permisos = await admin.get('/api/permisos');
      expect(permisos.body.data[0]).toEqual(
        expect.objectContaining({ codigo: expect.any(String), descripcion: expect.any(String) }),
      );
    });
  });

  describe('control de acceso con los tres roles', () => {
    it.each(['MEDICO', 'ENFERMERO'] as const)('el %s no puede gestionar usuarios', async (rol) => {
      const { agente } = await agenteConRol(rol);
      expect((await agente.get('/api/usuarios')).status).toBe(403);
      expect((await agente.post('/api/usuarios').send(nuevo())).status).toBe(403);
    });

    it('sin sesión responde 401', async () => {
      expect((await request(obtenerApp()).get('/api/usuarios')).status).toBe(401);
    });
  });
});
