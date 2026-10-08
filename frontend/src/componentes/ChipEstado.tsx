import { Chip } from '@mui/material';
import { ESTADOS_CHIP, type EstadoChip } from './estadosChip';

export type { EstadoChip };

/**
 * Chip de estado (F30). Mide 28 px de alto con texto de 0.875rem: el tamaño `small` de MUI
 * (24 px, texto de 13 px) queda chico para leerlo de pie, a un brazo de distancia.
 */
export function ChipEstado({ estado }: { estado: EstadoChip }) {
  const { etiqueta, color, variante } = ESTADOS_CHIP[estado];
  return (
    <Chip
      label={etiqueta}
      color={color}
      variant={variante}
      sx={{ height: 28, fontSize: '0.875rem' }}
    />
  );
}
