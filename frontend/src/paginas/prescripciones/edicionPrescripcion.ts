/**
 * Lógica de la edición de una prescripción (T306 · CU19), sin interfaz: qué campos cambiaron,
 * cómo se muestran antes y después, y qué dice cada cambio de estado.
 */
import type { CambiosPrescripcion } from '../../api/prescripciones';
import type { Paciente, Prescripcion, Via } from '../../api/tipos';
import { formatearFechaHora } from '../../utilidades/formato';
import { campoFechaHora, isoDeCampoFechaHora } from '../../utilidades/campoFechaHora';
import { etiquetaVia, formatearDosis, formatearFrecuencia } from './etiquetas';

export interface Edicion {
  dosis: string;
  unidadDosis: string;
  frecuenciaHoras: string;
  via: string;
  fin: string;
  observaciones: string;
}

export const desde = (p: Prescripcion): Edicion => ({
  dosis: String(p.dosis),
  unidadDosis: p.unidadDosis,
  frecuenciaHoras: String(p.frecuenciaHoras),
  via: p.via,
  fin: p.fechaFin ? campoFechaHora(p.fechaFin) : '',
  observaciones: p.observaciones ?? '',
});

/** Solo los campos que cambiaron, con el formato de la API. */
export function cambiosDe(p: Prescripcion, e: Edicion): Omit<CambiosPrescripcion, 'motivo'> {
  const original = desde(p);
  const c: Omit<CambiosPrescripcion, 'motivo'> = {};
  if (e.dosis !== original.dosis) c.dosis = Number(e.dosis);
  if (e.unidadDosis !== original.unidadDosis) c.unidadDosis = e.unidadDosis.trim();
  if (e.frecuenciaHoras !== original.frecuenciaHoras) c.frecuenciaHoras = Number(e.frecuenciaHoras);
  if (e.via !== original.via) c.via = e.via as Via;
  if (e.fin !== original.fin) c.fechaFin = e.fin ? isoDeCampoFechaHora(e.fin) : null;
  if (e.observaciones !== original.observaciones) c.observaciones = e.observaciones;
  return c;
}

const finTexto = (fin: string | null) => (fin ? formatearFechaHora(fin) : 'Sin fecha de fin');

/** Filas "antes → después" de lo que cambia, para revisar antes de guardar. */
export function filasDeCambios(p: Prescripcion, e: Edicion) {
  const c = cambiosDe(p, e);
  const filas: { campo: string; antes: string; despues: string }[] = [];
  if (c.dosis !== undefined || c.unidadDosis !== undefined) {
    filas.push({
      campo: 'Dosis',
      antes: formatearDosis(p.dosis, p.unidadDosis),
      despues: formatearDosis(Number(e.dosis), e.unidadDosis.trim()),
    });
  }
  if (c.frecuenciaHoras !== undefined) {
    filas.push({
      campo: 'Frecuencia',
      antes: formatearFrecuencia(p.frecuenciaHoras),
      despues: formatearFrecuencia(c.frecuenciaHoras),
    });
  }
  if (c.via !== undefined) {
    filas.push({ campo: 'Vía', antes: etiquetaVia(p.via), despues: etiquetaVia(c.via) });
  }
  if (c.fechaFin !== undefined) {
    filas.push({ campo: 'Fin', antes: finTexto(p.fechaFin), despues: finTexto(c.fechaFin) });
  }
  if (c.observaciones !== undefined) {
    filas.push({
      campo: 'Observaciones',
      antes: p.observaciones || '—',
      despues: c.observaciones || '—',
    });
  }
  return filas;
}

export const nombreConCama = (pac: Paciente | undefined) =>
  pac
    ? `${pac.apellido}, ${pac.nombre}${pac.cama ? ` (cama ${pac.cama.numero})` : ''}`
    : 'el paciente';

export const ACCIONES: Record<
  'SUSPENDIDA' | 'FINALIZADA' | 'VIGENTE',
  { boton: string; titulo: string; aviso: string; mensaje: (descripcion: string) => string }
> = {
  SUSPENDIDA: {
    boton: 'Suspender',
    titulo: 'Suspender la prescripción',
    aviso: 'La prescripción quedó suspendida',
    mensaje: (d) =>
      `Se suspende ${d}. Se cancelarán los recordatorios pendientes; se puede reanudar después.`,
  },
  FINALIZADA: {
    boton: 'Finalizar',
    titulo: 'Finalizar la prescripción',
    aviso: 'La prescripción quedó finalizada',
    mensaje: (d) =>
      `Se finaliza ${d}. Se cancelarán los recordatorios pendientes y no se puede reanudar.`,
  },
  VIGENTE: {
    boton: 'Reanudar',
    titulo: 'Reanudar la prescripción',
    aviso: 'La prescripción volvió a estar vigente',
    mensaje: (d) => `Se reanuda ${d}: vuelve a generar tomas desde ahora.`,
  },
};
