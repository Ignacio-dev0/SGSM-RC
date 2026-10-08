import { Router, type Response } from 'express';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import { estadisticasDelPeriodo } from './estadisticas.servicio';
import {
  exportarEstadisticas,
  exportarSuministros,
  type ArchivoExportado,
} from './exportacion.servicio';
import { reporteSuministros } from './reporte.servicio';
import {
  esquemaEstadisticas,
  esquemaExportarEstadisticas,
  esquemaExportarSuministros,
  esquemaReporteSuministros,
} from './reportes.esquemas';

/** /api/reportes — reporte de suministros, estadísticas y su exportación (E6 · docs/reportes.md). */
export const rutasReportes = Router();

const ver = requierePermiso('reportes.ver');
const exportar = requierePermiso('reportes.exportar');

/** Descarga: el nombre del archivo lo da el servidor; datos clínicos, sin caché. */
function enviarArchivo(res: Response, { contenido, tipoContenido, nombre }: ArchivoExportado) {
  res
    .status(200)
    .set({
      'Content-Type': tipoContenido,
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': String(contenido.length),
      'Cache-Control': 'no-store',
    })
    .end(contenido);
}

rutasReportes.get('/suministros', ver, async (req, res) => {
  res.json(await reporteSuministros(validar(esquemaReporteSuministros, req.query)));
});

rutasReportes.get('/estadisticas', ver, async (req, res) => {
  res.json(await estadisticasDelPeriodo(validar(esquemaEstadisticas, req.query)));
});

rutasReportes.get('/suministros/exportar', exportar, async (req, res) => {
  const parametros = validar(esquemaExportarSuministros, req.query);
  enviarArchivo(res, await exportarSuministros(parametros, usuarioActual(req)));
});

rutasReportes.get('/estadisticas/exportar', exportar, async (req, res) => {
  const parametros = validar(esquemaExportarEstadisticas, req.query);
  enviarArchivo(res, await exportarEstadisticas(parametros, usuarioActual(req)));
});
