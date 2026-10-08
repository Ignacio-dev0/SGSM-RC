import type { ReactNode } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as EnlaceRouter } from 'react-router-dom';
import { AyudaFlotante } from './AyudaFlotante';
import { ESTILO_TITULO_ENFOCABLE, useEncabezadoDePantalla } from './useEncabezadoDePantalla';

interface Props {
  titulo: string;
  subtitulo?: ReactNode;
  /** Ruta a la que vuelve la flecha; sin ella no se muestra. */
  volverA?: string;
  acciones?: ReactNode;
}

/** A qué pantalla vuelve la flecha, según la ruta de destino (sin la búsqueda ni el hash). */
const DESTINOS: [RegExp, string][] = [
  [/^\/$/, 'Volver al inicio'],
  [/^\/pacientes$/, 'Volver a Pacientes'],
  [/^\/pacientes\/\d+$/, 'Volver a la ficha del paciente'],
  [/^\/suministros$/, 'Volver a Suministros'],
  [/^\/catalogo$/, 'Volver a Catálogo'],
  [/^\/biometria$/, 'Volver a Biometría'],
  [/^\/usuarios$/, 'Volver a Usuarios'],
  [/^\/usuarios\/\d+$/, 'Volver al usuario'],
  [/^\/recordatorios$/, 'Volver a Recordatorios'],
];

/** Texto de la ayuda de la flecha: el destino si se reconoce; si no, solo "Volver". */
function textoVolver(destino: string) {
  const ruta = destino.split(/[?#]/)[0]!.replace(/(.)\/+$/, '$1');
  return DESTINOS.find(([patron]) => patron.test(ruta))?.[1] ?? 'Volver';
}

/**
 * Título de cada pantalla con su acción principal a la derecha (T010). En teléfono la flecha y el
 * título comparten la fila y las acciones pasan debajo (F33); al abrirse, la pantalla toma el título
 * del documento y el foco en el título (UX-14).
 */
export function EncabezadoPagina({ titulo, subtitulo, volverA, acciones }: Props) {
  const refTitulo = useEncabezadoDePantalla(titulo);
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 2 },
        mb: 3,
        flexWrap: 'wrap',
      }}
    >
      {volverA && (
        // El nombre accesible es "Volver"; la ayuda agrega a dónde lleva.
        <AyudaFlotante texto={textoVolver(volverA)}>
          <IconButton component={EnlaceRouter} to={volverA} aria-label="Volver" edge="start">
            <ArrowBackIcon />
          </IconButton>
        </AyudaFlotante>
      )}
      {/* Sin ancho propio en teléfono para quedar junto a la flecha; en tablet, al menos 200 px. */}
      <Box sx={{ flex: '1 1 0', minWidth: { xs: 0, sm: 200 } }}>
        <Typography
          variant="h4"
          component="h1"
          ref={refTitulo}
          tabIndex={-1}
          sx={ESTILO_TITULO_ENFOCABLE}
        >
          {titulo}
        </Typography>
        {subtitulo && (
          <Typography color="text.secondary" component="div">
            {subtitulo}
          </Typography>
        )}
      </Box>
      {acciones && (
        <Box
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flexBasis: { xs: '100%', sm: 'auto' } }}
        >
          {acciones}
        </Box>
      )}
    </Box>
  );
}
