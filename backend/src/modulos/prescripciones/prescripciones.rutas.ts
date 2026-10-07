import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import {
  esquemaAltaPrescripcion,
  esquemaCambioEstado,
  esquemaFiltroEstado,
  esquemaModificacionPrescripcion,
} from './prescripciones.esquemas';
import {
  cambiarEstadoPrescripcion,
  crearPrescripcion,
  listarPrescripcionesDePaciente,
  modificarPrescripcion,
  obtenerPrescripcion,
} from './prescripciones.servicio';

const ver = requierePermiso('prescripciones.ver');
const gestionar = requierePermiso('prescripciones.gestionar');

/** /api/pacientes/:id/prescripciones — CU17 (alta) y CU18 (consulta por paciente). */
export const rutasPrescripcionesDePaciente = Router({ mergeParams: true });

rutasPrescripcionesDePaciente.get('/', ver, async (req, res) => {
  const { estado } = validar(esquemaFiltroEstado, req.query);
  res.json({ data: await listarPrescripcionesDePaciente(idDeRuta(req.params.id), estado) });
});

rutasPrescripcionesDePaciente.post('/', gestionar, async (req, res) => {
  const datos = validar(esquemaAltaPrescripcion, req.body);
  res
    .status(201)
    .json({ data: await crearPrescripcion(idDeRuta(req.params.id), datos, usuarioActual(req).id) });
});

/** /api/prescripciones — detalle (CU18), modificación y cambios de estado (CU19). */
export const rutasPrescripciones = Router();

rutasPrescripciones.get('/:id', ver, async (req, res) => {
  res.json({ data: await obtenerPrescripcion(idDeRuta(req.params.id)) });
});

rutasPrescripciones.patch('/:id', gestionar, async (req, res) => {
  const datos = validar(esquemaModificacionPrescripcion, req.body);
  res.json({
    data: await modificarPrescripcion(idDeRuta(req.params.id), datos, usuarioActual(req).id),
  });
});

rutasPrescripciones.post('/:id/estado', gestionar, async (req, res) => {
  const datos = validar(esquemaCambioEstado, req.body);
  res.json({
    data: await cambiarEstadoPrescripcion(idDeRuta(req.params.id), datos, usuarioActual(req).id),
  });
});
