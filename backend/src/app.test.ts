import request from 'supertest';
import { crearApp } from './app';

describe('app', () => {
  it('responde el estado de salud de la API', async () => {
    const res = await request(crearApp()).get('/api/salud');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { estado: 'ok' } });
  });

  it('responde 404 con el formato de error de la API para rutas inexistentes', async () => {
    const res = await request(crearApp()).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado' },
    });
  });
});
