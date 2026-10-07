import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import {
  eliminarBiometria,
  esquemaRegistroBiometrico,
  estadoBiometrico,
  fotoDeReferencia,
  guardarBiometria,
  listarPersonal,
} from './biometria.servicio';

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
