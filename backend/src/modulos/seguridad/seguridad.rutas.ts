import { Router, type RequestHandler } from 'express';
import { sinPermiso } from '../../comun/errores';
import { prisma } from '../../db';
import { usuarioActual } from '../auth/sesion';
import { tienePermiso } from './permisos';

/** Los catálogos de roles y permisos los usan las pantallas de usuarios y de permisos. */
const gestionaUsuarios: RequestHandler = (req, _res, next) => {
  const u = usuarioActual(req);
  if (!tienePermiso(u, 'usuarios.gestionar') && !tienePermiso(u, 'usuarios.permisos')) {
    throw sinPermiso();
  }
  next();
};

/** /api/roles */
export const rutasRoles = Router();

rutasRoles.get('/', gestionaUsuarios, async (_req, res) => {
  const roles = await prisma.rol.findMany({
    include: { permisos: { include: { permiso: true } } },
    orderBy: { codigo: 'asc' },
  });
  res.json({
    data: roles.map((r) => ({
      codigo: r.codigo,
      nombre: r.nombre,
      descripcion: r.descripcion,
      permisos: r.permisos.map((rp) => rp.permiso.codigo).sort(),
    })),
  });
});

/** /api/permisos */
export const rutasPermisos = Router();

rutasPermisos.get('/', gestionaUsuarios, async (_req, res) => {
  const permisos = await prisma.permiso.findMany({
    orderBy: [{ modulo: 'asc' }, { codigo: 'asc' }],
  });
  res.json({
    data: permisos.map((p) => ({ codigo: p.codigo, modulo: p.modulo, descripcion: p.descripcion })),
  });
});
