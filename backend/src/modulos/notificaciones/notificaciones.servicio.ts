import type { Prisma } from '@prisma/client';
import type { ClienteDb } from '../../db';

export interface NuevaNotificacion {
  /** CUENTA_BLOQUEADA, VALIDACION_FACIAL_FALLIDA, ... */
  tipo: string;
  mensaje: string;
  datos?: Prisma.InputJsonValue;
}

/**
 * Avisa al administrador principal (T112 · T407). Se interpreta como "administrador principal"
 * a todo usuario activo con rol ADMINISTRADOR: cada uno recibe su copia de la notificación.
 */
export async function notificarAdministradores(db: ClienteDb, n: NuevaNotificacion) {
  const admins = await db.usuario.findMany({
    where: { activo: true, rol: { codigo: 'ADMINISTRADOR' } },
    select: { id: true },
  });
  await db.notificacion.createMany({
    data: admins.map((a) => ({
      destinatarioId: a.id,
      tipo: n.tipo,
      mensaje: n.mensaje,
      ...(n.datos !== undefined ? { datos: n.datos } : {}),
    })),
  });
}
