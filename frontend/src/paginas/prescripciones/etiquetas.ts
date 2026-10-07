// Textos para mostrar las prescripciones.
import type { EstadoPrescripcion, Prescripcion, Via } from '../../api/tipos';

export const VIAS: { valor: Via; etiqueta: string }[] = [
  { valor: 'ORAL', etiqueta: 'Oral' },
  { valor: 'SUBLINGUAL', etiqueta: 'Sublingual' },
  { valor: 'INTRAVENOSA', etiqueta: 'Intravenosa' },
  { valor: 'INTRAMUSCULAR', etiqueta: 'Intramuscular' },
  { valor: 'SUBCUTANEA', etiqueta: 'Subcutánea' },
  { valor: 'TOPICA', etiqueta: 'Tópica' },
  { valor: 'INHALATORIA', etiqueta: 'Inhalatoria' },
  { valor: 'SONDA', etiqueta: 'Por sonda' },
  { valor: 'RECTAL', etiqueta: 'Rectal' },
  { valor: 'OTRA', etiqueta: 'Otra' },
];

export const etiquetaVia = (v: Via) => VIAS.find((x) => x.valor === v)?.etiqueta ?? v;

export const FRECUENCIAS = [1, 2, 4, 6, 8, 12, 24, 48, 72].map((h) => ({
  valor: String(h),
  etiqueta: h === 1 ? 'Cada 1 hora' : `Cada ${h} horas`,
}));

export const ESTADOS: Record<
  EstadoPrescripcion,
  { etiqueta: string; color: 'success' | 'warning' | 'default' }
> = {
  VIGENTE: { etiqueta: 'Vigente', color: 'success' },
  SUSPENDIDA: { etiqueta: 'Suspendida', color: 'warning' },
  FINALIZADA: { etiqueta: 'Finalizada', color: 'default' },
};

/**
 * "500 mg", "0,5 comprimido": decimales con coma, como se leen en Argentina, y SIN separador de
 * miles ("1000 mg", no "1.000 mg"), para que una dosis no se confunda con un decimal.
 */
export const formatearDosis = (dosis: number, unidad: string) =>
  `${dosis.toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: 3 })} ${unidad}`;

export const formatearFrecuencia = (horas: number) => `cada ${horas} h`;

export const resumenPrescripcion = (
  p: Pick<Prescripcion, 'dosis' | 'unidadDosis' | 'frecuenciaHoras'>,
) => `${formatearDosis(p.dosis, p.unidadDosis)} ${formatearFrecuencia(p.frecuenciaHoras)}`;

/** "AAAA-MM-DDTHH:mm" en hora local para los campos datetime-local. */
export function aLocal(fecha: Date | string) {
  const d = new Date(fecha);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
