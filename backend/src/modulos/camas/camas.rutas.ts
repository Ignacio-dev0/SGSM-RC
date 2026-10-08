import { Router } from 'express';
import { z } from 'zod';
import { validar } from '../../comun/validacion';
import { requierePermiso } from '../seguridad/permisos';
import { listarCamas, listarSalas } from './camas.servicio';

const esquemaFiltros = z.object({
  salaId: z.coerce.number().int().positive().optional(),
  estado: z.enum(['libre', 'ocupada']).optional(),
});

/** /api/camas — T201 */
export const rutasCamas = Router();

rutasCamas.get('/', requierePermiso('pacientes.ver'), async (req, res) => {
  res.json({ data: await listarCamas(validar(esquemaFiltros, req.query)) });
});

/** /api/salas — T201 */
export const rutasSalas = Router();

rutasSalas.get('/', requierePermiso('pacientes.ver'), async (_req, res) => {
  res.json({ data: await listarSalas() });
});
