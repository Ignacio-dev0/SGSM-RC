import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import { corregirSuministro } from './correccion.servicio';
import { buscarSuministros, obtenerSuministro, responsables } from './historial.servicio';
import {
  esquemaAdministracion,
  esquemaBusquedaSuministros,
  esquemaCorreccion,
  esquemaInsumos,
} from './suministros.esquemas';
import { registrarAdministracion, registrarInsumos } from './suministros.servicio';

/** /api/suministros — registro (T408, T409), historial (T411) y corrección (T412). */
export const rutasSuministros = Router();

const registrar = requierePermiso('suministros.registrar');
const ver = requierePermiso('suministros.ver');

rutasSuministros.get('/', ver, async (req, res) => {
  res.json(await buscarSuministros(validar(esquemaBusquedaSuministros, req.query)));
});

rutasSuministros.get('/responsables', ver, async (_req, res) => {
  res.json({ data: await responsables() });
});

rutasSuministros.get('/:id', ver, async (req, res) => {
  res.json({ data: await obtenerSuministro(idDeRuta(req.params.id)) });
});

rutasSuministros.post('/medicamentos', registrar, async (req, res) => {
  const datos = validar(esquemaAdministracion, req.body);
  res.status(201).json({ data: await registrarAdministracion(datos, usuarioActual(req).id) });
});

rutasSuministros.post('/insumos', registrar, async (req, res) => {
  const datos = validar(esquemaInsumos, req.body);
  res.status(201).json({ data: await registrarInsumos(datos, usuarioActual(req).id) });
});

rutasSuministros.patch('/:id', requierePermiso('suministros.corregir'), async (req, res) => {
  const datos = validar(esquemaCorreccion, req.body);
  res.json({
    data: await corregirSuministro(idDeRuta(req.params.id), datos, usuarioActual(req).id),
  });
});
