import type { ReactNode } from 'react';
import { Box } from '@mui/material';

interface PropsGrilla {
  /** Los filtros: el primero suele ser el campo de búsqueda. */
  children: ReactNode;
  /** Columnas en pantalla ancha, por ejemplo "2fr 1fr 1fr". */
  columnas: string;
  /** Desde qué ancho valen `columnas`: "md" (escritorio chico) o "lg". */
  desde?: 'md' | 'lg';
}

/**
 * Los filtros de un listado. En teléfono van apilados; en tablet vertical (desde 600 px) de a dos
 * columnas, con el primero —la búsqueda— a todo el ancho; en pantalla ancha, en `columnas`. Así en
 * 768 px no quedan tres campos estirados uno debajo del otro (F32).
 */
export function GrillaDeFiltros({ children, columnas, desde = 'md' }: PropsGrilla) {
  return (
    <Box
      role="search"
      aria-label="Filtros"
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', [desde]: columnas },
        mb: 2,
        '& > :first-of-type': { gridColumn: { sm: '1 / -1', [desde]: 'auto' } },
      }}
    >
      {children}
    </Box>
  );
}

interface PropsRecargando {
  /** Verdadero mientras se pide de nuevo un listado y siguen a la vista las filas anteriores. */
  activo: boolean;
  children: ReactNode;
}

/**
 * Atenúa las filas viejas mientras llegan las nuevas (`keepPreviousData`), para que no se tomen
 * por el resultado de lo que se acaba de filtrar (F32). Avisa `aria-busy` a los lectores de
 * pantalla; con movimiento reducido el cambio es instantáneo.
 */
export function Recargando({ activo, children }: PropsRecargando) {
  return (
    <Box
      aria-busy={activo}
      sx={{
        opacity: activo ? 0.5 : 1,
        transition: 'opacity 150ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {children}
    </Box>
  );
}

interface PropsPrincipal {
  children: ReactNode;
  /** Ancho mínimo en píxeles, para que el encabezado de la columna no se parta. */
  ancho?: number;
}

/**
 * Lo que identifica a cada fila de un listado (la persona, el insumo) en negrita y con un ancho
 * mínimo: en tablet vertical la columna principal no se angosta hasta partir su encabezado (F32).
 * El mínimo vale desde tablet: en las tarjetas del teléfono el valor ya ocupa lo que le toca y
 * forzarlo desbordaría la tarjeta.
 */
export function ColumnaPrincipal({ children, ancho = 150 }: PropsPrincipal) {
  return (
    <Box component="strong" sx={{ display: 'inline-block', minWidth: { sm: ancho } }}>
      {children}
    </Box>
  );
}
