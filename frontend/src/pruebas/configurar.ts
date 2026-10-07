import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { validarContrato } from './contrato';
import { servidor } from './servidor';

// Con todos los archivos en paralelo, una pantalla de MUI puede tardar más de 1 s (el valor por
// defecto) en mostrar el resultado de un guardado: se espera hasta 5 s antes de dar por fallido.
configure({ asyncUtilTimeout: 5_000 });

/** Revisión contra el esquema del servidor de cada cuerpo que mandó una pantalla (contrato.ts). */
let revisiones: Promise<string | null>[] = [];

beforeAll(() => {
  servidor.listen({ onUnhandledRequest: 'error' });
  servidor.events.on('request:start', ({ request }) => {
    if (!['POST', 'PATCH', 'PUT'].includes(request.method)) return;
    const ruta = new URL(request.url).pathname;
    revisiones.push(
      request
        .clone()
        .text()
        .then((texto) =>
          validarContrato(request.method, ruta, texto ? JSON.parse(texto) : undefined),
        ),
    );
  });
});

afterEach(async () => {
  const errores = (await Promise.all(revisiones)).filter((e): e is string => e !== null);
  revisiones = [];
  cleanup();
  servidor.resetHandlers();
  localStorage.clear();
  expect(errores, 'La pantalla mandó algo que el servidor real rechazaría').toEqual([]);
});

afterAll(() => servidor.close());
