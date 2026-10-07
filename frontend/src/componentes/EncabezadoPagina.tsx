import type { ReactNode } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as EnlaceRouter } from 'react-router-dom';

interface Props {
  titulo: string;
  subtitulo?: ReactNode;
  /** Ruta a la que vuelve la flecha; sin ella no se muestra. */
  volverA?: string;
  acciones?: ReactNode;
}

/** Título de cada pantalla con su acción principal a la derecha (T010). */
export function EncabezadoPagina({ titulo, subtitulo, volverA, acciones }: Props) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        mb: 3,
        flexWrap: 'wrap',
      }}
    >
      {volverA && (
        <IconButton component={EnlaceRouter} to={volverA} aria-label="Volver">
          <ArrowBackIcon />
        </IconButton>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 200 }}>
        <Typography variant="h4" component="h1">
          {titulo}
        </Typography>
        {subtitulo && (
          <Typography color="text.secondary" component="div">
            {subtitulo}
          </Typography>
        )}
      </Box>
      {acciones && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{acciones}</Box>}
    </Box>
  );
}
