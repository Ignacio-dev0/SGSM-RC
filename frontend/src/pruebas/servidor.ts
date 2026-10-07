// Servidor de la API simulado con MSW para las pruebas de pantallas.
import { http, HttpResponse, ws } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Tiempo real de recordatorios (/api/tiempo-real). Las pruebas mandan avisos a todas las
 * conexiones con `canalTiempoReal.broadcast(...)` y cambian el comportamiento con
 * `servidor.use(canalTiempoReal.addEventListener('connection', ...))`.
 */
export const canalTiempoReal = ws.link('*/api/tiempo-real');

/**
 * Respuestas por defecto de lo que monta la plantilla en toda pantalla con sesión: la insignia de
 * recordatorios (lista vacía) y la conexión de tiempo real (acepta y manda `conectado`). Cada
 * prueba las reemplaza con `servidor.use`; `resetHandlers()` vuelve a estas.
 */
export const servidor = setupServer(
  http.get('*/api/recordatorios', () =>
    HttpResponse.json({
      data: [],
      meta: { total: 0, urgentes: 0, ahora: new Date().toISOString() },
    }),
  ),
  canalTiempoReal.addEventListener('connection', ({ client }) => {
    client.send(JSON.stringify({ tipo: 'conectado', momento: new Date().toISOString() }));
  }),
);
