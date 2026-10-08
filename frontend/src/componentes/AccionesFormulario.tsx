import type { ReactNode } from 'react';
import { Box } from '@mui/material';

/**
 * Pie de un formulario con sus botones (F31): el principal siempre al final y en el mismo lugar.
 *
 * - En teléfono ocupa el ancho completo y los botones se apilan, cada uno a lo ancho; el principal
 *   queda abajo, donde llega el pulgar.
 * - Desde tablet va en fila, alineado a la derecha, con 8 px de separación.
 *
 * Los hijos son los botones, en orden: primero los secundarios y al final la acción principal.
 */
export function AccionesFormulario({ children }: { children: ReactNode }) {
  return (
    <Box
      role="group"
      aria-label="Acciones del formulario"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: { sm: 'flex-end' },
        alignItems: { sm: 'center' },
        gap: 1,
        width: '100%',
        mt: 3,
        '& > *': { width: { xs: '100%', sm: 'auto' } },
      }}
    >
      {children}
    </Box>
  );
}
