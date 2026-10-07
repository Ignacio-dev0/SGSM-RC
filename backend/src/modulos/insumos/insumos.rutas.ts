import { Router } from 'express';
import { idDeRuta } from '../../comun/parametros';
import { validar } from '../../comun/validacion';
import { usuarioActual } from '../auth/sesion';
import { requierePermiso } from '../seguridad/permisos';
import {
  crearInsumo,
  darDeBajaInsumo,
  esquemaAltaInsumo,
  esquemaFiltrosInsumos,
  esquemaModificacionInsumo,
  listarInsumos,
  modificarInsumo,
  obtenerInsumo,
} from './insumos.servicio';

/** /api/insumos — catálogo de insumos y medicamentos (T303). */
export const rutasInsumos = Router();

const ver = requierePermiso('catalogo.ver');
const gestionar = requierePermiso('catalogo.gestionar');

rutasInsumos.get('/', ver, async (req, res) => {
  res.json({ data: await listarInsumos(validar(esquemaFiltrosInsumos, req.query)) });
});

rutasInsumos.get('/:id', ver, async (req, res) => {
  res.json({ data: await obtenerInsumo(idDeRuta(req.params.id)) });
});

rutasInsumos.post('/', gestionar, async (req, res) => {
  const datos = validar(esquemaAltaInsumo, req.body);
  res.status(201).json({ data: await crearInsumo(datos, usuarioActual(req).id) });
});

rutasInsumos.patch('/:id', gestionar, async (req, res) => {
  const datos = validar(esquemaModificacionInsumo, req.body);
  res.json({ data: await modificarInsumo(idDeRuta(req.params.id), datos, usuarioActual(req).id) });
});

rutasInsumos.delete('/:id', gestionar, async (req, res) => {
  res.json({ data: await darDeBajaInsumo(idDeRuta(req.params.id), usuarioActual(req).id) });
});
