import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { manejarErrores, rutaNoEncontrada } from './comun/middleware-errores';
import { autenticar } from './modulos/auth/auth.middleware';
import { rutasAuth } from './modulos/auth/auth.rutas';
import { rutasCamas, rutasSalas } from './modulos/camas/camas.rutas';
import { rutasPacientes } from './modulos/pacientes/pacientes.rutas';
import { rutasInsumos } from './modulos/insumos/insumos.rutas';
import { rutasNotificaciones } from './modulos/notificaciones/notificaciones.rutas';
import { rutasPermisos, rutasRoles } from './modulos/seguridad/seguridad.rutas';
import { rutasUsuarios } from './modulos/usuarios/usuarios.rutas';

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
  // Todo lo que sigue exige sesión; cada ruta pide además su permiso.
  app.use('/api/usuarios', autenticar, rutasUsuarios);
  app.use('/api/roles', autenticar, rutasRoles);
  app.use('/api/permisos', autenticar, rutasPermisos);
  app.use('/api/notificaciones', autenticar, rutasNotificaciones);
  app.use('/api/camas', autenticar, rutasCamas);
  app.use('/api/salas', autenticar, rutasSalas);
  app.use('/api/pacientes', autenticar, rutasPacientes);
  app.use('/api/insumos', autenticar, rutasInsumos);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
