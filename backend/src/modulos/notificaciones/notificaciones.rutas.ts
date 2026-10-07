import { Router } from 'express';
import { noEncontrado } from '../../comun/errores';
import { idDeRuta } from '../../comun/parametros';
import { prisma } from '../../db';
import { usuarioActual } from '../auth/sesion';

/** /api/notificaciones — avisos del usuario de la sesión (los administradores los reciben). */
export const rutasNotificaciones = Router();

rutasNotificaciones.get('/', async (req, res) => {
  const destinatarioId = usuarioActual(req).id;
  const [data, noLeidas] = await prisma.$transaction([
    prisma.notificacion.findMany({
      where: { destinatarioId },
      orderBy: [{ leida: 'asc' }, { creadaEn: 'desc' }, { id: 'desc' }],
      take: 50,
    }),
    prisma.notificacion.count({ where: { destinatarioId, leida: false } }),
  ]);
  res.json({ data, meta: { noLeidas } });
});

rutasNotificaciones.patch('/:id/leida', async (req, res) => {
  const id = idDeRuta(req.params.id);
  const { count } = await prisma.notificacion.updateMany({
    where: { id, destinatarioId: usuarioActual(req).id },
    data: { leida: true },
  });
  if (count === 0) throw noEncontrado('La notificación no existe');
  res.json({ data: await prisma.notificacion.findUniqueOrThrow({ where: { id } }) });
});
