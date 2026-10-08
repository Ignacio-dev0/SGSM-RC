// Textos para mostrar los valores del módulo de pacientes.
import type { Cama, Sexo } from '../../api/tipos';

export const SEXOS: { valor: Sexo; etiqueta: string }[] = [
  { valor: 'FEMENINO', etiqueta: 'Femenino' },
  { valor: 'MASCULINO', etiqueta: 'Masculino' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export const etiquetaSexo = (s: Sexo) => SEXOS.find((x) => x.valor === s)?.etiqueta ?? s;

export const MOTIVO_ASIGNACION: Record<string, string> = {
  INGRESO: 'Ingreso',
  TRASLADO: 'Traslado',
  REINGRESO: 'Reingreso',
};

/** Guion no separable (U+2011): con el común, "A-01" puede quedar partido en "A-" y "01". */
const GUION_NO_SEPARABLE = String.fromCharCode(0x2011);

/**
 * La cama como se muestra en un renglón que puede cortarse: "A-01" con un guion que no permite
 * el corte. Solo para texto en pantalla: en una opción de lista sigue siendo "A-01".
 */
export const formatearCama = (texto: string) => texto.replace(/-/g, GUION_NO_SEPARABLE);

export const descripcionCama = (c: Pick<Cama, 'numero' | 'sala'>) =>
  `${c.sala.nombre} · ${c.numero}`;

/** Dónde está el paciente, con la cama primero: "Cama A-01 · Sala A – Neurorrehabilitación". */
export const ubicacionCama = (c: Pick<Cama, 'numero' | 'sala'>) =>
  `Cama ${formatearCama(c.numero)} · ${c.sala.nombre}`;

/** Para una oración: "la cama A-01 (Sala A – Neurorrehabilitación)", sin cortar la cama. */
export const laCama = (c: Pick<Cama, 'numero' | 'sala'>) =>
  `la cama ${formatearCama(c.numero)} (${c.sala.nombre})`;

/** Opciones de cama para un Selector: "Sala A – … · A-02". */
export const opcionesDeCamas = (camas: Cama[]) =>
  camas.map((c) => ({ valor: String(c.id), etiqueta: descripcionCama(c) }));
