import { useId, useState, type ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import { Boton } from '../../componentes/Boton';
import { Tabla, type Columna } from '../../componentes/Tabla';

interface Props<T> {
  titulo: string;
  /** Qué mide y en qué unidad, debajo del título. */
  descripcion?: ReactNode;
  /** El gráfico, que toma el ancho del contenedor (sin ancho fijo: no hay scroll horizontal). */
  children: ReactNode;
  /** Los mismos datos del gráfico, para la tabla. */
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string | number;
  /** Nivel del título en la página: h2 bajo el título de pantalla. */
  nivel?: 'h2' | 'h3';
}

/**
 * Un gráfico con su título, su descripción y "Ver como tabla": un botón de mostrar y ocultar
 * (con `aria-expanded`) que despliega los mismos datos en una `Tabla` (tarjetas en teléfono),
 * para quien no ve el gráfico, usa lector de pantalla o necesita el número exacto.
 */
export function GraficoConTabla<T>({
  titulo,
  descripcion,
  children,
  columnas,
  filas,
  claveFila,
  nivel = 'h2',
}: Props<T>) {
  const id = useId();
  const [conTabla, setConTabla] = useState(false);

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={`${id}-titulo`}
      sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}
    >
      <Typography id={`${id}-titulo`} variant="h6" component={nivel}>
        {titulo}
      </Typography>
      {descripcion && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {descripcion}
        </Typography>
      )}
      <Box sx={{ width: '100%', minWidth: 0, mt: 2 }}>{children}</Box>
      <Boton
        variante="texto"
        startIcon={<TableRowsOutlinedIcon />}
        aria-expanded={conTabla}
        aria-controls={`${id}-tabla`}
        onClick={() => setConTabla((v) => !v)}
        sx={{ mt: 1 }}
      >
        {conTabla ? 'Ocultar la tabla' : 'Ver como tabla'}
      </Boton>
      <Box id={`${id}-tabla`} hidden={!conTabla} sx={{ mt: 1 }}>
        {conTabla && (
          <Tabla
            titulo={`${titulo} (tabla)`}
            columnas={columnas}
            filas={filas}
            claveFila={claveFila}
          />
        )}
      </Box>
    </Paper>
  );
}
