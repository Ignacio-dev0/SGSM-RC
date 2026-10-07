import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import {
  esquemaAltaUsuario,
  esquemaBusquedaUsuarios,
  esquemaModificacionUsuario,
  esquemaPermisosAdicionales,
} from './usuarios.esquemas';
import {
  asignarPermisosAdicionales,
  buscarUsuarios,
  crearUsuario,
  darDeBajaUsuario,
  reactivarUsuario,
  modificarUsuario,
  obtenerUsuario,
} from './usuarios.servicio';

/** /api/usuarios — T109 (CU01–CU04) y T111 (CU05). Requiere `autenticar` antes. */
export const rutasUsuarios = Router();

const gestionar = requierePermiso('usuarios.gestionar');

rutasUsuarios.get('/', gestionar, async (req, res) => {
  res.json(await buscarUsuarios(validar(esquemaBusquedaUsuarios, req.query)));
});

rutasUsuarios.get('/:id', gestionar, async (req, res) => {
  res.json({ data: await obtenerUsuario(idDeRuta(req.params.id)) });
});

rutasUsuarios.post('/', gestionar, async (req, res) => {
  const datos = validar(esquemaAltaUsuario, req.body);
  res.status(201).json({ data: await crearUsuario(datos, usuarioActual(req).id) });
});

rutasUsuarios.patch('/:id', gestionar, async (req, res) => {
  const datos = validar(esquemaModificacionUsuario, req.body);
  res.json({ data: await modificarUsuario(idDeRuta(req.params.id), datos, usuarioActual(req).id) });
});

rutasUsuarios.delete('/:id', gestionar, async (req, res) => {
  res.json({ data: await darDeBajaUsuario(idDeRuta(req.params.id), usuarioActual(req).id) });
});

rutasUsuarios.post('/:id/reactivar', gestionar, async (req, res) => {
  res.json({ data: await reactivarUsuario(idDeRuta(req.params.id), usuarioActual(req).id) });
});

rutasUsuarios.put(
  '/:id/permisos-adicionales',
  requierePermiso('usuarios.permisos'),
  async (req, res) => {
    const { permisos } = validar(esquemaPermisosAdicionales, req.body);
    res.json({
      data: await asignarPermisosAdicionales(
        idDeRuta(req.params.id),
        permisos,
        usuarioActual(req).id,
      ),
    });
  },
);
