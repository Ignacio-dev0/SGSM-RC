import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import {
  esquemaAltaPaciente,
  esquemaBusquedaPacientes,
  esquemaModificacionPaciente,
  esquemaReingreso,
} from './pacientes.esquemas';
import {
  buscarPacientes,
  crearPaciente,
  modificarPaciente,
  obtenerPaciente,
  reingresarPaciente,
} from './pacientes.servicio';

/** /api/pacientes — T202, T204 (CU11, CU13) */
export const rutasPacientes = Router();

const ver = requierePermiso('pacientes.ver');
const gestionar = requierePermiso('pacientes.gestionar');

rutasPacientes.get('/', ver, async (req, res) => {
  res.json(await buscarPacientes(validar(esquemaBusquedaPacientes, req.query)));
});

rutasPacientes.get('/:id', ver, async (req, res) => {
  res.json({ data: await obtenerPaciente(idDeRuta(req.params.id)) });
});

rutasPacientes.post('/', gestionar, async (req, res) => {
  const datos = validar(esquemaAltaPaciente, req.body);
  res.status(201).json({ data: await crearPaciente(datos, usuarioActual(req).id) });
});

rutasPacientes.patch('/:id', gestionar, async (req, res) => {
  const datos = validar(esquemaModificacionPaciente, req.body);
  res.json({
    data: await modificarPaciente(idDeRuta(req.params.id), datos, usuarioActual(req).id),
  });
});

rutasPacientes.post('/:id/reingresar', gestionar, async (req, res) => {
  const datos = validar(esquemaReingreso, req.body);
  res.json({
    data: await reingresarPaciente(idDeRuta(req.params.id), datos, usuarioActual(req).id),
  });
});
