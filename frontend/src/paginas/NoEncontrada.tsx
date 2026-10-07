import { Box, Button, Typography } from '@mui/material';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import { Link as EnlaceRouter } from 'react-router-dom';
import { EncabezadoPagina } from '../componentes/EncabezadoPagina';

/**
 * Dirección que no corresponde a ninguna pantalla: lo dice en vez de llevar a Inicio en silencio
 * (UX-22). Se muestra dentro de la disposición, así el menú sigue a mano.
 */
export function NoEncontrada() {
  return (
    <>
      <EncabezadoPagina titulo="No se encontró esta pantalla" />
      <Box sx={{ maxWidth: 560 }}>
        <SearchOffOutlinedIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 1 }} />
        <Typography sx={{ mb: 3 }}>
          La dirección que abrió no corresponde a ninguna pantalla del sistema. Puede que esté mal
          escrita o que la pantalla ya no exista. Use el menú o vuelva al inicio.
        </Typography>
        <Button
          variant="contained"
          startIcon={<HomeOutlinedIcon />}
          component={EnlaceRouter}
          to="/"
        >
          Ir al inicio
        </Button>
      </Box>
    </>
  );
}
