import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type * as ModuloApp from './app';
import type * as ModuloDb from './db';
import { prisma } from './db';
import {
  CONTRASENA,
  agenteConRol,
  crearUsuario,
  obtenerApp,
  prepararBaseConSeguridad,
} from '../tests/soporte/sesion';

const CLAVE_PRODUCCION = Buffer.alloc(32, 7).toString('base64');

const variablesOriginales: Record<string, string | undefined>[] = [];

/**
 * Carga la API de cero con estas variables, como la arrancaría el servidor con ese entorno (la
 * configuración se lee al cargar el módulo; la base, al conectarse). Se restauran al terminar.
 */
function apiCon(variables: Record<string, string>) {
  variablesOriginales.push(
    Object.fromEntries(Object.keys(variables).map((k) => [k, process.env[k]])),
  );
  Object.assign(process.env, variables);
  let api!: { app: Express; db: PrismaClient };
  jest.isolateModules(() => {
    const { crearApp } = jest.requireActual<typeof ModuloApp>('./app');
    const { prisma: db } = jest.requireActual<typeof ModuloDb>('./db');
    api = { app: crearApp(), db };
  });
  return api;
}

function restaurarVariables() {
  for (const anteriores of variablesOriginales.splice(0).reverse()) {
    for (const [k, v] of Object.entries(anteriores)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const produccion = (extra: Record<string, string> = {}) =>
  apiCon({
    NODE_ENV: 'production',
    JWT_SECRETO: 'una-clave-larga-de-prueba-para-produccion',
    BIOMETRIA_CLAVE: CLAVE_PRODUCCION,
    COOKIE_SEGURA: 'true',
    ...extra,
  });

describe('encabezados HTTP, cookie de sesión y errores (T705)', () => {
  const abiertas: PrismaClient[] = [];
  const api = (a: { app: Express; db: PrismaClient }) => {
    abiertas.push(a.db);
    return a.app;
  };

  beforeEach(() => prepararBaseConSeguridad());
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(abiertas.splice(0).map((db) => db.$disconnect()));
    restaurarVariables();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('con NODE_ENV=production', () => {
    it('la cookie de sesión es HttpOnly, SameSite=Strict, Secure y solo para /api', async () => {
      const app = api(produccion());
      await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ nombreUsuario: 'sacosta', contrasena: CONTRASENA });

      expect(res.status).toBe(200);
      const cookie = res.headers['set-cookie']?.[0] ?? '';
      expect(cookie).toMatch(/^sgsm_sesion=/);
      expect(cookie).toMatch(/; Path=\/api(;|$)/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=Strict/);

      // Al salir se borra con los mismos atributos (si no, el navegador no la reemplaza).
      const salida = await request(app).post('/api/auth/logout');
      const borrada = salida.headers['set-cookie']?.[0] ?? '';
      expect(borrada).toMatch(/^sgsm_sesion=;.*Path=\/api.*HttpOnly.*Secure.*SameSite=Strict/);
    });

    it('envía HSTS, una CSP cerrada y los demás encabezados; sin x-powered-by', async () => {
      const res = await request(api(produccion())).get('/api/salud');

      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
      const csp = res.headers['content-security-policy'] ?? '';
      expect(csp).toMatch(/default-src 'none'/);
      expect(csp).toMatch(/frame-ancestors 'none'/);
      expect(csp).toMatch(/base-uri 'none'/);
      expect(csp).toMatch(/form-action 'none'/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('por HTTP (COOKIE_SEGURA=false) la cookie no es Secure y no hay HSTS', async () => {
      const app = api(produccion({ COOKIE_SEGURA: 'false' }));
      await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ nombreUsuario: 'sacosta', contrasena: CONTRASENA });

      expect(res.headers['set-cookie']?.[0]).not.toMatch(/Secure/);
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('un error 500 no devuelve el mensaje interno ni la traza', async () => {
      const app = api(
        produccion({ DATABASE_URL: 'postgresql://sgsm:sgsm@localhost:5432/no_existe_t705' }),
      );
      const registro = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ nombreUsuario: 'sacosta', contrasena: CONTRASENA });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' },
      });
      expect(res.text).not.toMatch(/no_existe|prisma|localhost|\bat /i);
      // El detalle queda solo en el registro del servidor.
      expect(registro).toHaveBeenCalled();
    });
  });

  describe('fuera de producción', () => {
    it('sin HTTPS no envía HSTS y la API tampoco deja caché', async () => {
      const { agente } = await agenteConRol('ADMINISTRADOR');
      const res = await agente.get('/api/usuarios');

      expect(res.headers['strict-transport-security']).toBeUndefined();
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('tamaño del cuerpo JSON', () => {
    it('la API rechaza con 413 un cuerpo de más de 100 KB, no con un 500', async () => {
      const res = await request(obtenerApp())
        .post('/api/auth/login')
        .send({ nombreUsuario: 'x', contrasena: 'y'.repeat(150 * 1024) });

      expect(res.status).toBe(413);
      expect(res.body.error).toEqual({
        codigo: 'CUERPO_DEMASIADO_GRANDE',
        mensaje: expect.stringMatching(/demasiado grande/),
      });
    });

    it('el registro del rostro acepta la foto más grande permitida (512 KB) y no más', async () => {
      const { agente: admin } = await agenteConRol('ADMINISTRADOR');
      const enfermero = await crearUsuario('ENFERMERO');
      const jpeg = (bytes: number) => {
        const foto = Buffer.alloc(bytes);
        foto.set([0xff, 0xd8, 0xff, 0xe0]);
        return `data:image/jpeg;base64,${foto.toString('base64')}`;
      };
      const patron = Array.from({ length: 128 }, (_, i) => -0.123456789012345 + i / 1000);

      const maxima = await admin
        .put(`/api/biometria/usuarios/${enfermero.id}`)
        .send({ patron, foto: jpeg(512 * 1024) });
      const excedida = await admin
        .put(`/api/biometria/usuarios/${enfermero.id}`)
        .send({ patron, foto: jpeg(600 * 1024) });

      expect(maxima.status).toBe(200);
      expect(excedida.status).toBe(413);
    });

    it('un JSON mal formado sigue siendo un 400', async () => {
      const res = await request(obtenerApp())
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"nombreUsuario":');
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('JSON_INVALIDO');
    });
  });
});
