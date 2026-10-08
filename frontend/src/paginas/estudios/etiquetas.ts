// Textos, estados y reglas de los estudios para mostrar en pantalla.
import { ErrorApi, mensajeDeError } from '../../api/cliente';
import type { EstadoEstudio } from '../../api/estudios';
import type { Paciente } from '../../api/tipos';
import { isoDeCampoFechaHora, msDeCampoFechaHora } from '../../utilidades/campoFechaHora';
import { formatearFechaHora, sinCortes } from '../../utilidades/formato';
import { formatearCama } from '../pacientes/etiquetas';

const ESPACIO_NO_SEPARABLE = String.fromCharCode(160);

/** "08/10/2026 10:00": la hora nunca queda sola en otro renglón. */
export const fechaYHora = (iso: string | null | undefined) =>
  formatearFechaHora(iso).replace(' ', ESPACIO_NO_SEPARABLE);

/**
 * Aspecto del chip de cada estado, con la regla de componentes/estadosChip.ts (F30): lo
 * esperable con contorno neutro y lo cerrado (ya no está en curso) con relleno neutro. Ninguno
 * en verde: que se haya realizado no es un "todo bien" que deba llamar la vista, y la etiqueta
 * siempre dice el estado (no solo el color).
 */
export const ESTADOS_ESTUDIO: Record<
  EstadoEstudio,
  { etiqueta: string; variante: 'outlined' | 'filled' }
> = {
  PROGRAMADO: { etiqueta: 'Programado', variante: 'outlined' },
  REALIZADO: { etiqueta: 'Realizado', variante: 'filled' },
  CANCELADO: { etiqueta: 'Cancelado', variante: 'filled' },
};

/** Lo que el servidor acepta como fecha de un estudio (D26), dicho igual en toda la pantalla. */
export const RANGO_FECHA = sinCortes('entre 5 min atrás y 90 días adelante');
const TOLERANCIA_PASADO_MS = 5 * 60_000;
const MAXIMO_ADELANTE_MS = 90 * 24 * 3_600_000;

/** Error del campo datetime-local de la fecha del estudio (hora de Argentina), con las reglas del servidor. */
export function errorDeFecha(valorLocal: string, ahora = Date.now()): string | undefined {
  const momento = msDeCampoFechaHora(valorLocal);
  if (Number.isNaN(momento)) return 'Indique la fecha y hora del estudio';
  if (momento < ahora - TOLERANCIA_PASADO_MS) return `Esa hora ya pasó: elija una ${RANGO_FECHA}.`;
  if (momento > ahora + MAXIMO_ADELANTE_MS) {
    return `Es demasiado adelante: elija una ${RANGO_FECHA}.`;
  }
  return undefined;
}

/**
 * Ayuda del campo de la fecha: con una fecha válida, cómo quedará con el formato de la app (el
 * campo nativo puede mostrarla con otro formato, por ejemplo con a. m./p. m.); si no, el rango.
 */
export function ayudaDeFecha(valorLocal: string) {
  const iso = isoDeCampoFechaHora(valorLocal);
  return iso
    ? `Quedará para el ${fechaYHora(iso)}`
    : sinCortes('Entre 5 min atrás y 90 días adelante');
}

/** 409: lo cerró otra persona o la misma desde otra tablet (E5-14); el historial dice quién. */
export const MENSAJE_NO_PROGRAMADO =
  'Este estudio ya estaba confirmado o cancelado (por usted o por otra persona)';

/** 409: otra persona ya lo confirmó o canceló; no tiene sentido reintentar. */
export const esNoProgramado = (e: unknown) =>
  e instanceof ErrorApi && e.codigo === 'ESTUDIO_NO_PROGRAMADO';

/** Error del servidor en palabras; `campo` dice junto a qué campo va (si no, en un aviso). */
export function errorDelServidor(e: unknown): { campo?: 'tipo' | 'fecha'; texto: string } {
  switch (e instanceof ErrorApi ? e.codigo : '') {
    case 'PACIENTE_NO_INTERNADO':
      return { texto: 'El paciente ya no está internado: no se le pueden programar estudios.' };
    case 'TIPO_ESTUDIO_NO_DISPONIBLE':
      return { campo: 'tipo', texto: 'Ese tipo de estudio ya no está disponible. Elija otro.' };
    case 'FECHA_ESTUDIO_INVALIDA':
      return { campo: 'fecha', texto: `La fecha y hora tiene que estar ${RANGO_FECHA}.` };
    case 'SIN_CAMBIOS':
      return {
        campo: 'fecha',
        texto: 'El estudio ya estaba programado para esa fecha y hora. Elija otra.',
      };
    case 'ESTUDIO_NO_PROGRAMADO':
      return { texto: `${MENSAJE_NO_PROGRAMADO}.` };
    case 'VALIDACION_FACIAL_REQUERIDA':
      return { texto: 'La validación del rostro venció o no corresponde; vuelva a validarla.' };
    default:
      return { texto: mensajeDeError(e) };
  }
}

/** Quién es el paciente, para los diálogos: el rostro identifica a quien registra, no a él. */
export interface PacienteDelEstudio {
  apellido: string;
  nombre: string;
  dni: string;
  /** Número de cama ("A-01"); null si no tiene. */
  cama: string | null;
}

export const pacienteDelEstudio = (p: Paciente): PacienteDelEstudio => ({
  apellido: p.apellido,
  nombre: p.nombre,
  dni: p.dni,
  cama: p.cama?.numero ?? null,
});

/** "Benítez, Rosa · DNI 30111222 · Cama A-01" (la cama con guion que no corta). */
export const identidad = (p: PacienteDelEstudio) =>
  [`${p.apellido}, ${p.nombre}`, `DNI ${p.dni}`, p.cama ? `Cama ${formatearCama(p.cama)}` : null]
    .filter(Boolean)
    .join(' · ');
