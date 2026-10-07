import WebSocket from 'ws';
import { prisma } from './db';
import { levantarServidor } from './servidor';

describe('servidor: API, tiempo real y temporizador en un solo proceso', () => {
  afterAll(() => prisma.$disconnect());

  it('atiende la API y el WebSocket en el mismo puerto; sin temporizador si está apagado', async () => {
    const ciclo = jest.fn().mockResolvedValue(undefined);
    const s = await levantarServidor({ puerto: 0, temporizador: false, ciclo });
    try {
      const salud = await fetch(`http://127.0.0.1:${s.puerto}/api/salud`);
      expect(await salud.json()).toEqual({ data: { estado: 'ok' } });

      // Sin cookie el tiempo real abre y cierra con 4001: el upgrade lo atiende el servidor.
      const ws = new WebSocket(`ws://127.0.0.1:${s.puerto}/api/tiempo-real`);
      const codigo = await new Promise<number>((ok) => ws.on('close', (c) => ok(c)));
      expect(codigo).toBe(4001);
      expect(ciclo).not.toHaveBeenCalled();
    } finally {
      await s.cerrar();
    }
  });

  it('con el temporizador encendido corre un ciclo al arrancar y lo detiene al cerrar', async () => {
    const ciclo = jest.fn().mockResolvedValue(undefined);

    const s = await levantarServidor({ puerto: 0, temporizador: true, ciclo });
    expect(ciclo).toHaveBeenCalledTimes(1);
    await s.cerrar();

    await expect(fetch(`http://127.0.0.1:${s.puerto}/api/salud`)).rejects.toThrow();
  });
});
