import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import { esquemaRegistroBiometrico, esquemaValidacion } from './biometria.esquemas';
import {
  eliminarBiometria,
  estadoBiometrico,
  fotoDeReferencia,
  guardarBiometria,
  listarPersonal,
} from './biometria.servicio';
import { validarRostro } from './validacion.servicio';

/** /api/biometria — gestión de datos biométricos (T403) y validación facial (T404, T407). */
export const rutasBiometria = Router();

const gestionar = requierePermiso('biometria.gestionar');

rutasBiometria.get('/usuarios', gestionar, async (_req, res) => {
  res.json({ data: await listarPersonal() });
});

rutasBiometria.get('/usuarios/:id', gestionar, async (req, res) => {
  res.json({ data: await estadoBiometrico(idDeRuta(req.params.id)) });
});

rutasBiometria.get('/usuarios/:id/foto', gestionar, async (req, res) => {
  const { fotoReferencia, fotoTipo } = await fotoDeReferencia(idDeRuta(req.params.id));
  res.set({ 'Content-Type': fotoTipo, 'Cache-Control': 'no-store' }).send(fotoReferencia);
});

rutasBiometria.put('/usuarios/:id', gestionar, async (req, res) => {
  const datos = validar(esquemaRegistroBiometrico, req.body);
  res.json({ data: await guardarBiometria(idDeRuta(req.params.id), datos, usuarioActual(req).id) });
});

rutasBiometria.delete('/usuarios/:id', gestionar, async (req, res) => {
  res.json({ data: await eliminarBiometria(idDeRuta(req.params.id), usuarioActual(req).id) });
});

/**
 * POST /api/biometria/validar — valida el rostro del usuario de la sesión (CU10). No pide un
 * permiso propio: el comprobante solo sirve en endpoints que exigen el suyo.
 */
rutasBiometria.post('/validar', async (req, res) => {
  const { patron, operacion } = validar(esquemaValidacion, req.body);
  res.json({ data: await validarRostro(usuarioActual(req).id, patron, operacion) });
});
