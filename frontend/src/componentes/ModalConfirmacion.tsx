import { useEffect, useId, useState, type ReactNode } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Boton } from './Boton';
import { CampoTexto } from './CampoTexto';

interface Props {
  abierto: boolean;
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar: string;
  /** Pinta el botón de confirmar en rojo (bajas, cancelaciones). */
  peligroso?: boolean;
  /** Pide un motivo obligatorio antes de confirmar. */
  pedirMotivo?: boolean;
  etiquetaMotivo?: string;
  cargando?: boolean;
  /** Contenido adicional (por ejemplo, campos de fecha) debajo del mensaje. */
  children?: ReactNode;
  alConfirmar: (motivo?: string) => void;
  alCancelar: () => void;
}

/** Modal de confirmación estándar (T010) para acciones que modifican o eliminan datos. */
export function ModalConfirmacion({
  abierto,
  titulo,
  mensaje,
  textoConfirmar,
  peligroso = false,
  pedirMotivo = false,
  etiquetaMotivo = 'Motivo',
  cargando = false,
  children,
  alConfirmar,
  alCancelar,
}: Props) {
  const idTitulo = useId();
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (!abierto) setMotivo('');
  }, [abierto]);

  const faltaMotivo = pedirMotivo && motivo.trim() === '';

  return (
    <Dialog
      open={abierto}
      onClose={cargando ? undefined : alCancelar}
      aria-labelledby={idTitulo}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id={idTitulo}>{titulo}</DialogTitle>
      <DialogContent>
        {typeof mensaje === 'string' ? <Typography>{mensaje}</Typography> : mensaje}
        {children}
        {pedirMotivo && (
          <CampoTexto
            etiqueta={etiquetaMotivo}
            valor={motivo}
            alCambiar={setMotivo}
            required
            multiline
            minRows={2}
            sx={{ mt: 2 }}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Boton variante="texto" onClick={alCancelar} disabled={cargando}>
          Cancelar
        </Boton>
        <Boton
          variante={peligroso ? 'peligro' : 'principal'}
          cargando={cargando}
          disabled={faltaMotivo}
          onClick={() => alConfirmar(pedirMotivo ? motivo.trim() : undefined)}
        >
          {textoConfirmar}
        </Boton>
      </DialogActions>
    </Dialog>
  );
}
