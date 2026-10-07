import { useEffect } from 'react';
import { Box, IconButton, Paper } from '@mui/material';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useLocation, useNavigate } from 'react-router-dom';
import { Boton } from '../componentes/Boton';

export interface Aviso {
  texto: string;
  /** Cambia con cada aviso: el lector de pantalla lo anuncia aunque el texto se repita. */
  id: number;
}

/** Cuánto queda a la vista el aviso; la insignia de la barra sigue mostrando la cantidad. */
const DURACION_AVISO_MS = 15_000;

/**
 * Aviso de recordatorios nuevos para quien atiende, en cualquier pantalla. La región `aria-live`
 * está siempre en la página (vacía si no hay aviso) para que el lector de pantalla anuncie el
 * texto cuando aparece, sin interrumpir. El aviso a la vista lleva a la lista y se puede cerrar.
 */
export function AvisoNuevos({ aviso, alCerrar }: { aviso: Aviso | null; alCerrar: () => void }) {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const enLaLista = pathname === '/recordatorios';

  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(alCerrar, DURACION_AVISO_MS);
    return () => clearTimeout(id);
  }, [aviso, alCerrar]);

  return (
    <Box
      sx={(t) => ({
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: t.zIndex.snackbar,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      })}
    >
      <Paper
        elevation={aviso ? 6 : 0}
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          maxWidth: 560,
          bgcolor: aviso ? 'background.paper' : 'transparent',
          pointerEvents: aviso ? 'auto' : 'none',
          ...(aviso && { py: 1, pl: 2, pr: 1, border: 2, borderColor: 'warning.main' }),
        }}
      >
        {aviso && <AlarmOutlinedIcon sx={{ color: 'warning.main' }} />}
        {/* Sin role="status": con la región siempre presente, competiría con los mensajes de
            estado de cada pantalla. aria-live alcanza para que se anuncie sin interrumpir. */}
        <Box
          aria-live="polite"
          aria-atomic="true"
          data-avisos-recordatorios
          sx={{ fontWeight: 700, fontSize: '1.0625rem', flex: '1 1 auto' }}
        >
          {aviso && <span key={aviso.id}>{aviso.texto}</span>}
        </Box>
        {aviso && !enLaLista && (
          <Boton
            variante="texto"
            onClick={() => {
              alCerrar();
              navegar('/recordatorios');
            }}
          >
            Ver recordatorios
          </Boton>
        )}
        {aviso && (
          <IconButton aria-label="Cerrar el aviso" title="Cerrar el aviso" onClick={alCerrar}>
            <CloseIcon />
          </IconButton>
        )}
      </Paper>
    </Box>
  );
}
