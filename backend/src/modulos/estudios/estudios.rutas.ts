import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import { confirmarEstudio } from './confirmacion.servicio';
import {
  esquemaCancelarEstudio,
  esquemaConfirmarEstudio,
  esquemaFiltroEstudios,
  esquemaProgramarEstudio,
  esquemaReprogramarEstudio,
} from './estudios.esquemas';
import {
  cancelarEstudio,
  listarEstudiosDePaciente,
  listarTiposEstudio,
  obtenerEstudio,
  programarEstudio,
  reprogramarEstudio,
} from './estudios.servicio';

const ver = requierePermiso('estudios.ver');
const gestionar = requierePermiso('estudios.gestionar');

/** /api/tipos-estudio — catálogo para programar (T509). */
export const rutasTiposEstudio = Router();

rutasTiposEstudio.get('/', ver, async (_req, res) => {
  res.json({ data: await listarTiposEstudio() });
});

/** /api/pacientes/:id/estudios — consulta (T510) y programación (T511) por paciente. */
export const rutasEstudiosDePaciente = Router({ mergeParams: true });

rutasEstudiosDePaciente.get('/', ver, async (req, res) => {
  const { estado } = validar(esquemaFiltroEstudios, req.query);
  res.json({ data: await listarEstudiosDePaciente(idDeRuta(req.params.id), estado) });
});

rutasEstudiosDePaciente.post('/', gestionar, async (req, res) => {
  const datos = validar(esquemaProgramarEstudio, req.body);
  res
    .status(201)
    .json({ data: await programarEstudio(idDeRuta(req.params.id), datos, usuarioActual(req).id) });
});

/** /api/estudios — detalle, reprogramar y cancelar (T512) y confirmar con el rostro (T513). */
export const rutasEstudios = Router();

rutasEstudios.get('/:id', ver, async (req, res) => {
  res.json({ data: await obtenerEstudio(idDeRuta(req.params.id)) });
});

rutasEstudios.patch('/:id', gestionar, async (req, res) => {
  const datos = validar(esquemaReprogramarEstudio, req.body);
  res.json({
    data: await reprogramarEstudio(idDeRuta(req.params.id), datos, usuarioActual(req).id),
  });
});

rutasEstudios.post('/:id/cancelar', gestionar, async (req, res) => {
  const datos = validar(esquemaCancelarEstudio, req.body);
  res.json({ data: await cancelarEstudio(idDeRuta(req.params.id), datos, usuarioActual(req).id) });
});

rutasEstudios.post('/:id/confirmar', requierePermiso('estudios.confirmar'), async (req, res) => {
  const datos = validar(esquemaConfirmarEstudio, req.body);
  res.json({ data: await confirmarEstudio(idDeRuta(req.params.id), datos, usuarioActual(req).id) });
});
