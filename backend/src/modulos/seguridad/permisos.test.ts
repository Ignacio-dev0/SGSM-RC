import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { prisma } from '../../db';
import { manejarErrores } from '../../comun/middleware-errores';
import { autenticar } from '../auth/auth.middleware';
import { rutasAuth } from '../auth/auth.rutas';
import type { UsuarioSesion } from '../auth/sesion';
import { requierePermiso, tienePermiso } from './permisos';
import { CONTRASENA, crearUsuario, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

const usuario = (permisos: string[]): UsuarioSesion => ({
  id: 1,
  nombreUsuario: 'x',
  nombre: 'x',
  apellido: 'x',
  rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
  permisos,
  tieneBiometria: false,
});

describe('control de acceso por permisos (T106 · CU05 · RN05 · RF15)', () => {
  describe('tienePermiso', () => {
    it('es verdadero solo si el usuario tiene ese permiso', () => {
      expect(tienePermiso(usuario(['pacientes.ver']), 'pacientes.ver')).toBe(true);
      expect(tienePermiso(usuario(['pacientes.ver']), 'pacientes.gestionar')).toBe(false);
    });
  });

  describe('requierePermiso', () => {
    // App mínima con un endpoint protegido, para probar el middleware aislado.
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', rutasAuth);
    app.get('/api/protegido', autenticar, requierePermiso('usuarios.gestionar'), (_req, res) => {
      res.json({ data: 'ok' });
    });
    app.use(manejarErrores);

    const pedirComo = async (u: { nombreUsuario: string }) => {
      const agente = request.agent(app);
      await agente
        .post('/api/auth/login')
        .send({ nombreUsuario: u.nombreUsuario, contrasena: CONTRASENA });
      return agente.get('/api/protegido');
    };

    beforeEach(() => prepararBaseConSeguridad());
    afterAll(() => prisma.$disconnect());

    it('deja pasar al rol que tiene el permiso', async () => {
      const res = await pedirComo(await crearUsuario('ADMINISTRADOR'));
      expect(res.status).toBe(200);
    });

    it.each(['MEDICO', 'ENFERMERO'] as const)('rechaza al %s con 403', async (rol) => {
      const res = await pedirComo(await crearUsuario(rol));
      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    });

    it('deja pasar a quien tiene el permiso como adicional aunque su rol no lo traiga', async () => {
      const u = await crearUsuario('ENFERMERO', { permisosAdicionales: ['usuarios.gestionar'] });
      expect((await pedirComo(u)).status).toBe(200);
    });

    it('sin sesión responde 401', async () => {
      expect((await request(app).get('/api/protegido')).status).toBe(401);
    });
  });
});
