import type { Prisma } from '@prisma/client';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { SIN_ATENDER } from './recordatorios.servicio';

/**
 * Atender por administración (T507): el registro de una administración marca ATENDIDO el
 * recordatorio (pendiente o vencido) de su toma, la que guarda el suministro (D121). Corre dentro
 * de la transacción del suministro: si algo falla, no queda ni el suministro ni la atención.
 * Devuelve si atendió uno, para que quien llama avise al tiempo real después del commit.
 */
export async function atenderPorAdministracion(
  tx: Prisma.TransactionClient,
  datos: {
    prescripcionId: number;
    /** La toma a la que se atribuyó la administración. */
    toma: Date;
    suministroId: number;
    fechaHora: Date;
    usuarioId: number;
  },
): Promise<boolean> {
  const r = await tx.recordatorio.findFirst({
    where: {
      prescripcionId: datos.prescripcionId,
      fechaHoraObjetivo: datos.toma,
      estado: { in: SIN_ATENDER },
    },
  });
  if (!r) return false;

  // Si se atendió en el medio ("No se administró" u otra administración), no se pisa.
  const { count } = await tx.recordatorio.updateMany({
    where: { id: r.id, estado: { in: SIN_ATENDER } },
    data: {
      estado: 'ATENDIDO',
      atendidoEn: datos.fechaHora,
      atendidoPorId: datos.usuarioId,
      suministroId: datos.suministroId,
    },
  });
  if (count === 0) return false;
  await registrarAuditoria(tx, {
    usuarioId: datos.usuarioId,
    accion: 'ATENDER',
    entidad: 'Recordatorio',
    entidadId: r.id,
    pacienteId: r.pacienteId,
    anterior: { estado: r.estado },
    nuevo: { estado: 'ATENDIDO', suministroId: datos.suministroId },
  });
  return true;
}

/**
 * Atender por confirmación de un estudio (T513): la confirmación con el rostro marca ATENDIDO
 * cada recordatorio pendiente o vencido del estudio (un vencido conserva vencidoEn), dentro de
 * la transacción de la confirmación. Devuelve cuántos atendió, para avisar después del commit.
 */
export async function atenderPorEstudio(
  tx: Prisma.TransactionClient,
  datos: { estudioId: number; fechaHora: Date; usuarioId: number },
): Promise<number> {
  const activos = await tx.recordatorio.findMany({
    where: { estudioId: datos.estudioId, estado: { in: SIN_ATENDER } },
  });
  let atendidos = 0;
  for (const r of activos) {
    const { count } = await tx.recordatorio.updateMany({
      where: { id: r.id, estado: { in: SIN_ATENDER } },
      data: { estado: 'ATENDIDO', atendidoEn: datos.fechaHora, atendidoPorId: datos.usuarioId },
    });
    if (count === 0) continue;
    atendidos++;
    await registrarAuditoria(tx, {
      usuarioId: datos.usuarioId,
      accion: 'ATENDER',
      entidad: 'Recordatorio',
      entidadId: r.id,
      pacienteId: r.pacienteId,
      anterior: { estado: r.estado },
      nuevo: { estado: 'ATENDIDO', estudioId: datos.estudioId },
    });
  }
  return atendidos;
}
