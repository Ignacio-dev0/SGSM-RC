import type { SvgIconComponent } from '@mui/icons-material';
import AccessAlarmOutlinedIcon from '@mui/icons-material/AccessAlarmOutlined';
import HourglassBottomOutlinedIcon from '@mui/icons-material/HourglassBottomOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import type { Recordatorio, TipoRecordatorio } from '../../api/recordatorios';
import { sinCortes } from '../../utilidades/formato';
import { duracion } from '../suministros/estadoToma';

/**
 * Urgencia de un recordatorio para el chip de la tarjeta, con la escala de DESIGN.md: el relleno
 * de color queda para lo que hay que hacer ya. La prioridad la calcula el servidor (S10: ALTA con
 * 5 min o menos o atrasada, MEDIA entre 5 y 15, BAJA con más de 15) y la renueva cada minuto; un
 * estudio queda siempre en MEDIA. Por eso, con los minutos que faltan (hora del servidor), lo
 * pendiente que ya pasó su hora es urgente aunque el servidor todavía no lo diga (E5-02).
 */
export type NivelUrgencia = 'VENCIDA' | 'URGENTE' | 'PRONTO' | 'PROGRAMADA';

export function nivelDeUrgencia(
  r: Pick<Recordatorio, 'estado' | 'prioridad'>,
  minutos?: number,
): NivelUrgencia {
  if (r.estado === 'VENCIDO') return 'VENCIDA';
  if (r.prioridad === 'ALTA' || (minutos !== undefined && minutos < 0)) return 'URGENTE';
  if (r.prioridad === 'MEDIA') return 'PRONTO';
  return 'PROGRAMADA';
}

/** Lo que va relleno de advertencia y con borde: vencido o urgente. */
export const esUrgente = (nivel: NivelUrgencia) => nivel === 'VENCIDA' || nivel === 'URGENTE';

interface Aspecto {
  /** Concuerda con lo que se recuerda: la toma (femenino) o el estudio (masculino). */
  etiqueta: Record<TipoRecordatorio, string>;
  /** Sin verde (una toma no es un "todo bien") ni rojo (queda para errores y peligro). */
  color: 'warning' | 'primary' | 'default';
  variante: 'filled' | 'outlined';
  /** El nivel nunca se dice solo con el color. */
  Icono: SvgIconComponent;
}

export const ASPECTO_URGENCIA: Record<NivelUrgencia, Aspecto> = {
  // Pasaron 60 min sin atenderse: ya se avisó al administrador; se puede atender tarde.
  VENCIDA: {
    etiqueta: { MEDICAMENTO: 'Vencida', ESTUDIO: 'Vencido' },
    color: 'warning',
    variante: 'filled',
    Icono: HourglassBottomOutlinedIcon,
  },
  // 5 min o menos para la toma, o atrasada.
  URGENTE: {
    etiqueta: { MEDICAMENTO: 'Urgente', ESTUDIO: 'Urgente' },
    color: 'warning',
    variante: 'filled',
    Icono: WarningAmberOutlinedIcon,
  },
  // Entre 5 y 15 min.
  PRONTO: {
    etiqueta: { MEDICAMENTO: 'Pronto', ESTUDIO: 'Pronto' },
    color: 'primary',
    variante: 'outlined',
    Icono: AccessAlarmOutlinedIcon,
  },
  // Más de 15 min: todavía no hay que hacer nada.
  PROGRAMADA: {
    etiqueta: { MEDICAMENTO: 'Programada', ESTUDIO: 'Programado' },
    color: 'default',
    variante: 'outlined',
    Icono: ScheduleOutlinedIcon,
  },
};

/** "Benítez, Rosa": como se nombra al paciente en los listados. */
export const nombrePaciente = (r: Pick<Recordatorio, 'paciente'>) =>
  `${r.paciente.apellido}, ${r.paciente.nombre}`;

const MINUTO = 60_000;

/** Minutos enteros que faltan para la toma o el estudio (negativos si ya pasó), con la hora del servidor. */
export const minutosHasta = (fechaHoraObjetivo: string, ahoraServidorMs: number) =>
  Math.round((new Date(fechaHoraObjetivo).getTime() - ahoraServidorMs) / MINUTO) || 0;

/**
 * "Faltan 12 min", "Atrasada 1 h 5 min" (la toma; "Atrasado", el estudio), "Toca ahora"; número y
 * unidad sin cortes. Lo vencido dice "Hace 45 min": el chip ya dice "Vencida", y "Atrasada" al
 * lado se leería como otro estado (E5-11).
 */
export function textoTiempo(
  minutos: number,
  tipo: TipoRecordatorio = 'MEDICAMENTO',
  vencido = false,
) {
  if (minutos > 0) return sinCortes(`Faltan ${duracion(minutos)}`);
  if (minutos < 0) {
    if (vencido) return sinCortes(`Hace ${duracion(-minutos)}`);
    return sinCortes(`${tipo === 'ESTUDIO' ? 'Atrasado' : 'Atrasada'} ${duracion(-minutos)}`);
  }
  return 'Toca ahora';
}

/**
 * Cuántos piden atención ya (vencidos, prioridad alta o atrasados), con la hora del servidor. El
 * servidor cuenta en `meta.urgentes` los ALTA y los vencidos, pero no un estudio atrasado (queda
 * en MEDIA): por eso se cuenta acá con la misma regla que el chip de la tarjeta (E5-02).
 */
export function contarUrgentes(
  lista: readonly Pick<Recordatorio, 'estado' | 'prioridad' | 'fechaHoraObjetivo'>[],
  ahoraServidorMs: number,
) {
  return lista.filter((r) =>
    esUrgente(nivelDeUrgencia(r, minutosHasta(r.fechaHoraObjetivo, ahoraServidorMs))),
  ).length;
}
