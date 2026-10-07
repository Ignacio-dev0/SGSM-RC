import { Router } from 'express';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import { esquemaAdministracion, esquemaInsumos } from './suministros.esquemas';
import { registrarAdministracion, registrarInsumos } from './suministros.servicio';

/** /api/suministros — registro (T408, T409), historial (T411) y corrección (T412). */
export const rutasSuministros = Router();

const registrar = requierePermiso('suministros.registrar');

rutasSuministros.post('/medicamentos', registrar, async (req, res) => {
  const datos = validar(esquemaAdministracion, req.body);
  res.status(201).json({ data: await registrarAdministracion(datos, usuarioActual(req).id) });
});

rutasSuministros.post('/insumos', registrar, async (req, res) => {
  const datos = validar(esquemaInsumos, req.body);
  res.status(201).json({ data: await registrarInsumos(datos, usuarioActual(req).id) });
});
