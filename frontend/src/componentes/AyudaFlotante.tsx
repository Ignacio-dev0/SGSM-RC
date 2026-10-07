import type { ReactElement } from 'react';
import { Tooltip } from '@mui/material';

interface Props {
  /** Texto breve de la ayuda: complementa al nombre accesible del control, no lo reemplaza. */
  texto: string;
  /** El control que la dispara; tiene que aceptar `ref` y recibir los eventos de foco y puntero. */
  children: ReactElement;
}

/**
 * Ayuda flotante (tooltip) SECUNDARIA para controles de solo ícono (UX-23). Nada de lo que dice es
 * necesario para completar la tarea: el nombre accesible del control va aparte, en su `aria-label`.
 * - Aparece con el foco del teclado y al pasar el puntero; `Esc` la cierra sin mover el foco.
 * - Es la descripción del control (`aria-describedby`), no su nombre, para no anunciarlo dos veces.
 * - Se puede pasar el puntero sobre ella sin que se cierre.
 * - En pantallas táctiles no aparece con el toque (que acciona el control): solo con una pulsación
 *   larga, así no se interpone en el camino.
 * Los colores son los del tema (texto sobre fondo invertido), con contraste AA en claro y oscuro.
 */
export function AyudaFlotante({ texto, children }: Props) {
  return (
    <Tooltip
      title={texto}
      describeChild
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: 'text.primary',
            color: 'background.default',
            // El tamaño de MUI (11 px) no se lee en una tablet a distancia de brazo.
            fontSize: '0.9375rem',
            fontWeight: 600,
            lineHeight: 1.35,
            px: 1.5,
            py: 0.75,
          },
        },
      }}
    >
      {children}
    </Tooltip>
  );
}
