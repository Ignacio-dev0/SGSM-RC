import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { servidor } from './servidor';

// Con todos los archivos en paralelo, una pantalla de MUI puede tardar más de 1 s (el valor por
// defecto) en mostrar el resultado de un guardado: se espera hasta 5 s antes de dar por fallido.
configure({ asyncUtilTimeout: 5_000 });

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  servidor.resetHandlers();
  localStorage.clear();
});
afterAll(() => servidor.close());
