import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { manejarErrores, rutaNoEncontrada } from './comun/middleware-errores';
import { rutasAuth } from './modulos/auth/auth.rutas';

/** Crea la aplicación Express. No escucha ningún puerto: eso lo hace server.ts. */
export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/salud', (_req, res) => {
    res.json({ data: { estado: 'ok' } });
  });

  app.use('/api/auth', rutasAuth);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
