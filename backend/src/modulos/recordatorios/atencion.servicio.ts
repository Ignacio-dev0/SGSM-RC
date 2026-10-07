import type { Prisma } from '@prisma/client';
import { registrarAuditoria } from '../auditoria/auditoria.servicio';
import { tomaMasCercana, type DatosAgenda } from '../prescripciones/agenda';
import { SIN_ATENDER } from './recordatorios.servicio';

/**
 * Atender por administración (T507): el registro de una administración marca ATENDIDO el
 * recordatorio (pendiente o vencido) de su toma más cercana. Corre dentro de la transacción del
 * suministro: si algo falla, no queda ni el suministro ni la atención. Devuelve si atendió uno,
 * para que quien llama avise al tiempo real después del commit.
 */
export async function atenderPorAdministracion(
  tx: Prisma.TransactionClient,
  datos: {
    prescripcion: DatosAgenda & { id: number };
    suministroId: number;
    fechaHora: Date;
    usuarioId: number;
  },
): Promise<boolean> {
  const toma = tomaMasCercana(datos.prescripcion, datos.fechaHora);
  if (!toma) return false;
  const r = await tx.recordatorio.findFirst({
    where: {
      prescripcionId: datos.prescripcion.id,
      fechaHoraObjetivo: toma,
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
