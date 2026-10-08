import request from 'supertest';
import { crearApp } from './app';
import { prisma } from './db';
import { salud } from './salud';

/**
 * GET /api/salud: el healthcheck de compose y scripts/estado.sh. Responde 200 solo si la base
 * contesta un SELECT 1 a tiempo; si no, 503 (D100).
 */
describe('salud de la API', () => {
  const tiempoMaximo = salud.tiempoMaximoMs;
  afterEach(() => {
    salud.tiempoMaximoMs = tiempoMaximo;
    jest.restoreAllMocks();
  });
  afterAll(() => prisma.$disconnect());

  it('con la base respondiendo: 200 { estado: "ok" }', async () => {
    const consulta = jest.spyOn(prisma, '$queryRaw');
    const res = await request(crearApp()).get('/api/salud');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { estado: 'ok' } });
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it('si la base falla: 503 { estado: "sin-base" }, sin detalles del error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValue(new Error("Can't reach database server at db:5432"));
    const res = await request(crearApp()).get('/api/salud');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ data: { estado: 'sin-base' } });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('la base no responde'),
      expect.stringContaining("Can't reach database server"),
    );
  });

  it('si la base no contesta a tiempo: 503 sin esperarla', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    salud.tiempoMaximoMs = 50;
    jest.spyOn(prisma, '$queryRaw').mockReturnValue(new Promise(() => {}) as never);
    const inicio = Date.now();
    const res = await request(crearApp()).get('/api/salud');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ data: { estado: 'sin-base' } });
    expect(Date.now() - inicio).toBeLessThan(1000);
  });

  it('el tiempo máximo es corto: menor que el timeout de 5 s del healthcheck de compose', () => {
    expect(tiempoMaximo).toBeGreaterThan(0);
    expect(tiempoMaximo).toBeLessThan(5000);
  });
});
