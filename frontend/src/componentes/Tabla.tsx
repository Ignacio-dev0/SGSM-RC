import type { ReactNode } from 'react';
import {
  Box,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';

export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => ReactNode;
  ancho?: number | string;
  alinear?: 'left' | 'right' | 'center';
}

export interface Paginacion {
  /** Página actual, empezando en 1 (igual que la API). */
  pagina: number;
  porPagina: number;
  total: number;
  alCambiarPagina: (pagina: number) => void;
}

interface Props<T> {
  /** Nombre accesible de la tabla. */
  titulo: string;
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string | number;
  mensajeVacio?: string;
  cargando?: boolean;
  alTocarFila?: (fila: T) => void;
  paginacion?: Paginacion;
}

/** Tabla estándar (T010) con estado vacío, carga, filas tocables y paginación de la API. */
export function Tabla<T>({
  titulo,
  columnas,
  filas,
  claveFila,
  mensajeVacio = 'No hay resultados',
  cargando = false,
  alTocarFila,
  paginacion,
}: Props<T>) {
  return (
    <Paper variant="outlined">
      {cargando && <LinearProgress aria-label="Cargando" />}
      <TableContainer>
        <Table aria-label={titulo}>
          <TableHead>
            <TableRow>
              {columnas.map((c) => (
                <TableCell key={c.titulo} align={c.alinear} sx={{ width: c.ancho }}>
                  {c.titulo}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filas.map((f) => (
              <TableRow
                key={claveFila(f)}
                hover={Boolean(alTocarFila)}
                onClick={alTocarFila ? () => alTocarFila(f) : undefined}
                sx={alTocarFila ? { cursor: 'pointer' } : undefined}
              >
                {columnas.map((c) => (
                  <TableCell key={c.titulo} align={c.alinear}>
                    {c.valor(f)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!cargando && filas.length === 0 && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">{mensajeVacio}</Typography>
        </Box>
      )}
      {paginacion && (
        <TablePagination
          component="div"
          count={paginacion.total}
          page={paginacion.pagina - 1}
          rowsPerPage={paginacion.porPagina}
          rowsPerPageOptions={[paginacion.porPagina]}
          onPageChange={(_e, p) => paginacion.alCambiarPagina(p + 1)}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          getItemAriaLabel={(tipo) => (tipo === 'next' ? 'Página siguiente' : 'Página anterior')}
        />
      )}
    </Paper>
  );
}
