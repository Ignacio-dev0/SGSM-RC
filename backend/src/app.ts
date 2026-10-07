import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { manejarErrores, rutaNoEncontrada } from './comun/middleware-errores';
import { config } from './config';
import { autenticar } from './modulos/auth/auth.middleware';
import { rutasAuditoria } from './modulos/auditoria/auditoria.rutas';
import { rutasAuth } from './modulos/auth/auth.rutas';
import { LIMITE_CUERPO_REGISTRO } from './modulos/biometria/biometria.esquemas';
import { rutasBiometria } from './modulos/biometria/biometria.rutas';
import { rutasCamas, rutasSalas } from './modulos/camas/camas.rutas';
import {
  rutasEstudios,
  rutasEstudiosDePaciente,
  rutasTiposEstudio,
} from './modulos/estudios/estudios.rutas';
import { rutasPacientes } from './modulos/pacientes/pacientes.rutas';
import {
  rutasPrescripciones,
  rutasPrescripcionesDePaciente,
} from './modulos/prescripciones/prescripciones.rutas';
import { rutasInsumos } from './modulos/insumos/insumos.rutas';
import { rutasNotificaciones } from './modulos/notificaciones/notificaciones.rutas';
import { rutasRecordatorios } from './modulos/recordatorios/recordatorios.rutas';
import { rutasReportes } from './modulos/reportes/reportes.rutas';
import { rutasSuministros } from './modulos/suministros/suministros.rutas';
import { rutasPermisos, rutasRoles } from './modulos/seguridad/seguridad.rutas';
import { rutasUsuarios } from './modulos/usuarios/usuarios.rutas';
import { rutaSalud } from './salud';

/** Crea la aplicación Express. No escucha ningún puerto: eso lo hace server.ts. */
export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  // IP real del cliente detrás de nginx o del proxy de Vite, para el límite del login (T705).
  app.set('trust proxy', config.confiarProxy);
  app.use(
    helmet({
      // La API solo devuelve JSON y archivos: no carga nada ni se muestra dentro de otra página.
      // La CSP de la interfaz la pone nginx (docs/seguridad.md, D56).
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      xFrameOptions: { action: 'deny' },
      // Solo detrás de HTTPS (COOKIE_SEGURA=true): por HTTP no tiene efecto y confunde.
      strictTransportSecurity: config.sesion.cookieSegura
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  );
  // Datos clínicos: ninguna respuesta de la API queda en la caché del navegador o de un proxy.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  // Solo el registro del rostro trae una foto; el resto de la API, como mucho 100 KB (D59).
  app.use('/api/biometria/usuarios', express.json({ limit: LIMITE_CUERPO_REGISTRO }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Pública: el healthcheck de compose; 503 si la base no responde (D100).
  app.get('/api/salud', rutaSalud);

  app.use('/api/auth', rutasAuth);
  // Todo lo que sigue exige sesión; cada ruta pide además su permiso.
  app.use('/api/usuarios', autenticar, rutasUsuarios);
  app.use('/api/roles', autenticar, rutasRoles);
  app.use('/api/permisos', autenticar, rutasPermisos);
  app.use('/api/notificaciones', autenticar, rutasNotificaciones);
  app.use('/api/camas', autenticar, rutasCamas);
  app.use('/api/salas', autenticar, rutasSalas);
  app.use('/api/pacientes/:id/prescripciones', autenticar, rutasPrescripcionesDePaciente);
  app.use('/api/pacientes/:id/estudios', autenticar, rutasEstudiosDePaciente);
  app.use('/api/pacientes', autenticar, rutasPacientes);
  app.use('/api/prescripciones', autenticar, rutasPrescripciones);
  app.use('/api/insumos', autenticar, rutasInsumos);
  app.use('/api/biometria', autenticar, rutasBiometria);
  app.use('/api/suministros', autenticar, rutasSuministros);
  app.use('/api/recordatorios', autenticar, rutasRecordatorios);
  app.use('/api/tipos-estudio', autenticar, rutasTiposEstudio);
  app.use('/api/estudios', autenticar, rutasEstudios);
  app.use('/api/reportes', autenticar, rutasReportes);
  app.use('/api/auditoria', autenticar, rutasAuditoria);

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
