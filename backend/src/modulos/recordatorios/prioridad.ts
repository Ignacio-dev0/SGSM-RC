import type { PrioridadRecordatorio, TipoRecordatorio } from '@prisma/client';
import { config } from '../../config';

/**
 * Prioridad según lo que falta para la toma (T503 · S10): BAJA con más de 15 min, MEDIA entre 5
 * y 15, ALTA con 5 o menos o atrasada. Los estudios, siempre MEDIA. Es automática y no se
 * audita (D12).
 */
export function prioridadDe(
  tipo: TipoRecordatorio,
  fechaHoraObjetivo: Date,
  ahora: Date,
): PrioridadRecordatorio {
  if (tipo === 'ESTUDIO') return 'MEDIA';
  const minutos = (fechaHoraObjetivo.getTime() - ahora.getTime()) / 60_000;
  if (minutos <= config.recordatorios.prioridadAltaMinutos) return 'ALTA';
  if (minutos <= config.recordatorios.prioridadMediaMinutos) return 'MEDIA';
  return 'BAJA';
}
