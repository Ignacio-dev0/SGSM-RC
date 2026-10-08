import request from 'supertest';
import { reloj } from '../../comun/reloj';
import { config } from '../../config';
import { prisma } from '../../db';
import {
  CONTRASENA,
  crearUsuario,
  obtenerApp,
  prepararBaseConSeguridad,
} from '../../../tests/soporte/sesion';
import { crearLimitePorIp } from './limite-ip';

describe('límite de intentos fallidos por IP (T705)', () => {
  describe('ventana deslizante con reloj inyectado', () => {
    let ahora: number;
    const limite = (maxFallidos = 3) =>
      crearLimitePorIp({ maxFallidos, ventanaMs: 60_000, ahora: () => ahora });
    beforeEach(() => {
      ahora = 1_000_000;
    });

    it('deja intentar hasta el máximo de fallidos y después frena solo a esa IP', () => {
      const l = limite();
      for (let i = 0; i < 3; i++) {
        expect(l.esperaSegundos('10.0.0.1')).toBe(0);
        l.registrarFallo('10.0.0.1');
        ahora += 1_000;
      }

      // El primer fallido (t = 1 000 000) vence a los 60 s: faltan 57.
      expect(l.esperaSegundos('10.0.0.1')).toBe(57);
      expect(l.esperaSegundos('10.0.0.2')).toBe(0);
    });

    it('al vencer el fallido más viejo se libera un intento, no toda la ventana', () => {
      const l = limite();
      for (let i = 0; i < 3; i++) {
        l.registrarFallo('10.0.0.1');
        ahora += 1_000;
      }

      ahora = 1_060_000;
      expect(l.esperaSegundos('10.0.0.1')).toBe(0);
      l.registrarFallo('10.0.0.1');
      // Ahora el más viejo es el de t = 1 001 000.
      expect(l.esperaSegundos('10.0.0.1')).toBe(1);
      ahora = 1_062_000;
      expect(l.esperaSegundos('10.0.0.1')).toBe(0);
    });

    it('con máximo 0 está desactivado', () => {
      const l = limite(0);
      for (let i = 0; i < 50; i++) l.registrarFallo('10.0.0.1');
      expect(l.esperaSegundos('10.0.0.1')).toBe(0);
    });

    it('olvida las IP sin fallidos recientes: la memoria no crece sin límite', () => {
      const l = limite();
      for (let i = 0; i < 100; i++) l.registrarFallo(`10.0.1.${i}`);
      expect(l.ipsRegistradas()).toBe(100);

      ahora += 61_000;
      l.esperaSegundos('10.0.0.9');

      expect(l.ipsRegistradas()).toBe(0);
    });

    it('reiniciar borra todo', () => {
      const l = limite(1);
      l.registrarFallo('10.0.0.1');
      l.reiniciar();
      expect(l.esperaSegundos('10.0.0.1')).toBe(0);
    });
  });

  describe('POST /api/auth/login', () => {
    const inicio = new Date('2026-10-07T10:00:00Z');
    const maximo = config.login.ip.maxFallidos;
    const ventanaSegundos = config.login.ip.ventanaMinutos * 60;
    let ahora: jest.SpyInstance<Date, []>;

    beforeEach(async () => {
      await prepararBaseConSeguridad();
      ahora = jest.spyOn(reloj, 'ahora').mockReturnValue(inicio);
    });
    afterEach(() => jest.restoreAllMocks());
    afterAll(() => prisma.$disconnect());

    const login = (nombreUsuario: string, contrasena: string, ip?: string) => {
      const pedido = request(obtenerApp()).post('/api/auth/login');
      if (ip) pedido.set('X-Forwarded-For', ip);
      return pedido.send({ nombreUsuario, contrasena });
    };

    it('frena un barrido de usuarios: 429 DEMASIADOS_INTENTOS con Retry-After', async () => {
      await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });
      // Un intento por usuario: ninguno llega al bloqueo de su cuenta (T112).
      for (let i = 0; i < maximo; i++) {
        expect((await login(i === 0 ? 'sacosta' : `usuario${i}`, 'Incorrecta1')).status).toBe(401);
      }

      const res = await login('sacosta', CONTRASENA);

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBe(String(ventanaSegundos));
      expect(res.body.error).toEqual({
        codigo: 'DEMASIADOS_INTENTOS',
        mensaje: expect.stringMatching(/Espere 15 minutos/),
        detalles: { reintentarEnSegundos: ventanaSegundos },
      });
      // Frenado antes de evaluar: no cuenta como intento de la cuenta ni se audita.
      expect(await prisma.auditoria.count({ where: { accion: 'INICIAR_SESION' } })).toBe(0);
    });

    it('pasada la ventana vuelve a dejar ingresar', async () => {
      await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });
      for (let i = 0; i < maximo; i++) await login(`usuario${i}`, 'Incorrecta1');

      ahora.mockReturnValue(new Date(inicio.getTime() + (ventanaSegundos + 1) * 1000));

      expect((await login('sacosta', CONTRASENA)).status).toBe(200);
    });

    it('cuenta solo los fallidos: ingresos correctos y datos inválidos no suman', async () => {
      await crearUsuario('ENFERMERO', { nombreUsuario: 'sacosta' });
      for (let i = 0; i < maximo + 2; i++) {
        expect((await login('sacosta', CONTRASENA)).status).toBe(200);
        expect((await login('', '')).status).toBe(400);
      }
      expect((await login('nadie', 'Incorrecta1')).status).toBe(401);
    });

    it('cada dispositivo detrás del proxy cuenta por separado (X-Forwarded-For)', async () => {
      for (let i = 0; i < maximo; i++) await login(`usuario${i}`, 'Incorrecta1', '192.168.10.21');

      expect((await login('otro', 'Incorrecta1', '192.168.10.21')).status).toBe(429);
      expect((await login('otro', 'Incorrecta1', '192.168.10.22')).status).toBe(401);
    });
  });
});
