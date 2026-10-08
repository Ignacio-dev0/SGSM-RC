import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import { esquemaBusquedaRecordatorios, esquemaNoAdministrado } from './recordatorios.esquemas';
import { listarRecordatorios, registrarNoAdministrado } from './recordatorios.servicio';

/** /api/recordatorios — panel (T506) y "No se administró" (T507). Ver docs/recordatorios.md. */
export const rutasRecordatorios = Router();

rutasRecordatorios.get('/', requierePermiso('recordatorios.ver'), async (req, res) => {
  res.json(await listarRecordatorios(validar(esquemaBusquedaRecordatorios, req.query)));
});

rutasRecordatorios.post(
  '/:id/no-administrar',
  requierePermiso('recordatorios.atender'),
  async (req, res) => {
    const id = idDeRuta(req.params.id);
    const { motivo } = validar(esquemaNoAdministrado, req.body);
    res.json({ data: await registrarNoAdministrado(id, motivo, usuarioActual(req).id) });
  },
);
