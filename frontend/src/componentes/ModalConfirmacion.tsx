import { useEffect, useId, useState, type ReactNode } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Boton } from './Boton';
import { CampoTexto } from './CampoTexto';

interface Props {
  abierto: boolean;
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar: string;
  /** Pinta el botón de confirmar en rojo relleno (bajas, cancelaciones): aquí sí es lo principal. */
  peligroso?: boolean;
  /** Pide un motivo obligatorio antes de confirmar. */
  pedirMotivo?: boolean;
  etiquetaMotivo?: string;
  /** Ejemplo o aclaración debajo del motivo. */
  ayudaMotivo?: string;
  /** Impide confirmar mientras falte algo del contenido adicional (una fecha, una cama…). */
  confirmarDeshabilitado?: boolean;
  cargando?: boolean;
  /** Contenido adicional (por ejemplo, campos de fecha) debajo del mensaje. */
  children?: ReactNode;
  alConfirmar: (motivo?: string) => void;
  alCancelar: () => void;
}

/** Largo mínimo del motivo: el mismo que exige el servidor. */
const MINIMO_MOTIVO = 3;

/**
 * Modal de confirmación estándar (T010) para acciones que modifican o eliminan datos. No se
 * cierra tocando afuera (se perdería el motivo escrito por un toque accidental): se sale con
 * Cancelar o Escape.
 */
export function ModalConfirmacion({
  abierto,
  titulo,
  mensaje,
  textoConfirmar,
  peligroso = false,
  pedirMotivo = false,
  etiquetaMotivo = 'Motivo',
  ayudaMotivo,
  confirmarDeshabilitado = false,
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

  const largoMotivo = motivo.trim().length;
  const faltaMotivo = pedirMotivo && largoMotivo < MINIMO_MOTIVO;

  return (
    <Dialog
      open={abierto}
      onClose={(_evento, razon) => {
        if (cargando || razon === 'backdropClick') return;
        alCancelar();
      }}
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
            error={
              largoMotivo > 0 && largoMotivo < MINIMO_MOTIVO
                ? `Escriba al menos ${MINIMO_MOTIVO} letras`
                : undefined
            }
            {...(ayudaMotivo ? { ayuda: ayudaMotivo } : {})}
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
          variante={peligroso ? 'peligroConfirmar' : 'principal'}
          cargando={cargando}
          disabled={faltaMotivo || confirmarDeshabilitado}
          onClick={() => alConfirmar(pedirMotivo ? motivo.trim() : undefined)}
        >
          {textoConfirmar}
        </Boton>
      </DialogActions>
    </Dialog>
  );
}
