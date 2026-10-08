import type { ChipProps } from '@mui/material';

/**
 * Regla única de los chips de estado (F30). El énfasis sube con lo que hay que hacer:
 *
 *  - Lo esperable, contorno neutro: Vigente, Internado, Activo, Validado, Registrado.
 *  - Lo cerrado (ya no está en curso), relleno neutro y suave: Finalizada, Egresado, Dado de baja.
 *  - Lo que pide atención, relleno de color: Suspendida, Bloqueado, Sin registrar.
 *  - Un hecho a tener en cuenta que no es un problema, contorno de color: Corregido.
 *
 * Así lo que llama la vista en un listado es lo que requiere atención, no lo normal. El estado
 * nunca se comunica solo con el color: la etiqueta siempre dice de qué se trata.
 */
export type EstadoChip =
  | 'VIGENTE'
  | 'SUSPENDIDA'
  | 'FINALIZADA'
  | 'INTERNADO'
  | 'EGRESADO'
  | 'ACTIVO'
  | 'DADO_DE_BAJA'
  | 'BLOQUEADO'
  | 'VALIDADO'
  | 'CORREGIDO'
  | 'REGISTRADO'
  | 'SIN_REGISTRAR';

interface Aspecto {
  etiqueta: string;
  /** Solo roles de la paleta: `default` es el neutro. */
  color: Extract<ChipProps['color'], 'default' | 'info' | 'warning'>;
  variante: 'outlined' | 'filled';
}

/** La única tabla de estado → etiqueta, color y variante. */
export const ESTADOS_CHIP: Record<EstadoChip, Aspecto> = {
  // Esperable
  VIGENTE: { etiqueta: 'Vigente', color: 'default', variante: 'outlined' },
  INTERNADO: { etiqueta: 'Internado', color: 'default', variante: 'outlined' },
  ACTIVO: { etiqueta: 'Activo', color: 'default', variante: 'outlined' },
  VALIDADO: { etiqueta: 'Validado', color: 'default', variante: 'outlined' },
  REGISTRADO: { etiqueta: 'Registrado', color: 'default', variante: 'outlined' },
  // Hecho a tener en cuenta
  CORREGIDO: { etiqueta: 'Corregido', color: 'info', variante: 'outlined' },
  // Pide atención
  SUSPENDIDA: { etiqueta: 'Suspendida', color: 'warning', variante: 'filled' },
  BLOQUEADO: { etiqueta: 'Bloqueado', color: 'warning', variante: 'filled' },
  SIN_REGISTRAR: { etiqueta: 'Sin registrar', color: 'warning', variante: 'filled' },
  // Cerrado
  FINALIZADA: { etiqueta: 'Finalizada', color: 'default', variante: 'filled' },
  EGRESADO: { etiqueta: 'Egresado', color: 'default', variante: 'filled' },
  DADO_DE_BAJA: { etiqueta: 'Dado de baja', color: 'default', variante: 'filled' },
};
