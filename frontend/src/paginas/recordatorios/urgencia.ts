import type { SvgIconComponent } from '@mui/icons-material';
import AccessAlarmOutlinedIcon from '@mui/icons-material/AccessAlarmOutlined';
import HourglassBottomOutlinedIcon from '@mui/icons-material/HourglassBottomOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import type { Recordatorio } from '../../api/recordatorios';
import { sinCortes } from '../../utilidades/formato';
import { duracion } from '../suministros/estadoToma';

/**
 * Urgencia de un recordatorio para el chip de la tarjeta, con la escala de DESIGN.md: el relleno
 * de color queda para lo que hay que hacer ya. La prioridad la calcula el servidor (S10: ALTA con
 * 5 min o menos o atrasada, MEDIA entre 5 y 15, BAJA con más de 15) y la renueva cada minuto.
 */
export type NivelUrgencia = 'VENCIDA' | 'URGENTE' | 'PRONTO' | 'PROGRAMADA';

export function nivelDeUrgencia(r: Pick<Recordatorio, 'estado' | 'prioridad'>): NivelUrgencia {
  if (r.estado === 'VENCIDO') return 'VENCIDA';
  if (r.prioridad === 'ALTA') return 'URGENTE';
  if (r.prioridad === 'MEDIA') return 'PRONTO';
  return 'PROGRAMADA';
}

interface Aspecto {
  etiqueta: string;
  /** Sin verde (una toma no es un "todo bien") ni rojo (queda para errores y peligro). */
  color: 'warning' | 'primary' | 'default';
  variante: 'filled' | 'outlined';
  /** El nivel nunca se dice solo con el color. */
  Icono: SvgIconComponent;
}

export const ASPECTO_URGENCIA: Record<NivelUrgencia, Aspecto> = {
  // Pasaron 60 min sin atenderse: ya se avisó al administrador; se puede atender tarde.
  VENCIDA: {
    etiqueta: 'Vencida',
    color: 'warning',
    variante: 'filled',
    Icono: HourglassBottomOutlinedIcon,
  },
  // 5 min o menos para la toma, o atrasada.
  URGENTE: {
    etiqueta: 'Urgente',
    color: 'warning',
    variante: 'filled',
    Icono: WarningAmberOutlinedIcon,
  },
  // Entre 5 y 15 min.
  PRONTO: {
    etiqueta: 'Pronto',
    color: 'primary',
    variante: 'outlined',
    Icono: AccessAlarmOutlinedIcon,
  },
  // Más de 15 min: todavía no hay que hacer nada.
  PROGRAMADA: {
    etiqueta: 'Programada',
    color: 'default',
    variante: 'outlined',
    Icono: ScheduleOutlinedIcon,
  },
};

/** "Benítez, Rosa": como se nombra al paciente en los listados. */
export const nombrePaciente = (r: Pick<Recordatorio, 'paciente'>) =>
  `${r.paciente.apellido}, ${r.paciente.nombre}`;

const MINUTO = 60_000;

/** Minutos enteros que faltan para la toma (negativos si ya pasó), con la hora del servidor. */
export const minutosHasta = (fechaHoraObjetivo: string, ahoraServidorMs: number) =>
  Math.round((new Date(fechaHoraObjetivo).getTime() - ahoraServidorMs) / MINUTO) || 0;

/** "Faltan 12 min", "Atrasada 1 h 5 min", "Toca ahora"; número y unidad sin cortes. */
export function textoTiempo(minutos: number) {
  if (minutos > 0) return sinCortes(`Faltan ${duracion(minutos)}`);
  if (minutos < 0) return sinCortes(`Atrasada ${duracion(-minutos)}`);
  return 'Toca ahora';
}
