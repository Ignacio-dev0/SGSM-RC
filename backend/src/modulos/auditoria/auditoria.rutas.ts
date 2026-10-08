import { Router } from 'express';
import { validar } from '../../comun/validacion';
import { requierePermiso } from '../seguridad/permisos';
import { esquemaBusquedaAuditoria } from './auditoria.esquemas';
import { consultarAuditoria, opcionesDeAuditoria } from './consulta.servicio';

/** /api/auditoria — consulta de la auditoría (T604 · CU35). Ver docs/reportes.md. */
export const rutasAuditoria = Router();

const ver = requierePermiso('auditoria.ver');

rutasAuditoria.get('/', ver, async (req, res) => {
  res.json(await consultarAuditoria(validar(esquemaBusquedaAuditoria, req.query)));
});

rutasAuditoria.get('/opciones', ver, async (_req, res) => {
  res.json({ data: await opcionesDeAuditoria() });
});
