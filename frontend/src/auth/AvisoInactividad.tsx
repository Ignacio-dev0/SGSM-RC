import { useId } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Boton } from '../componentes/Boton';

/**
 * Aviso del último minuto antes de cerrar la sesión por inactividad (T105 · RNF05): la
 * enfermera que volvió a la tablet no pierde lo que estaba cargando sin saber por qué.
 */
export function AvisoInactividad({
  segundos,
  alSeguir,
  alSalir,
}: {
  segundos: number;
  alSeguir: () => void;
  alSalir: () => void;
}) {
  const titulo = useId();
  return (
    <Dialog
      open
      role="alertdialog"
      aria-labelledby={titulo}
      onClose={(_evento, razon) => {
        if (razon !== 'backdropClick') alSeguir();
      }}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id={titulo}>¿Sigue ahí?</DialogTitle>
      <DialogContent>
        <Typography>
          Por seguridad, la sesión se cierra en {segundos} {segundos === 1 ? 'segundo' : 'segundos'}{' '}
          si no hay actividad. Lo que no se guardó se pierde.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Boton variante="texto" onClick={alSalir}>
          Cerrar sesión
        </Boton>
        <Boton onClick={alSeguir} autoFocus>
          Seguir trabajando
        </Boton>
      </DialogActions>
    </Dialog>
  );
}
