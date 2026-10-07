import { useEffect, useId, useState, type ReactNode } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Boton } from './Boton';
import { CampoTexto } from './CampoTexto';

interface Props {
  abierto: boolean;
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar: string;
  /** Texto del botón que no confirma; por defecto "Cancelar". */
  textoCancelar?: string;
  /** Pinta el botón de confirmar en rojo relleno (bajas, cancelaciones): aquí sí es lo principal. */
  peligroso?: boolean;
  /** Pide un motivo obligatorio antes de confirmar. */
  pedirMotivo?: boolean;
  etiquetaMotivo?: string;
  /** Ejemplo o aclaración debajo del motivo; el modal le agrega el mínimo de letras. */
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

/** Qué se exige, dicho desde el principio y no recién cuando falla (F52). */
const REQUISITO_MOTIVO = `mínimo ${MINIMO_MOTIVO} letras`;

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
  textoCancelar = 'Cancelar',
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
            ayuda={
              ayudaMotivo
                ? `${ayudaMotivo} (${REQUISITO_MOTIVO})`
                : `Escriba el motivo (${REQUISITO_MOTIVO})`
            }
            required
            multiline
            minRows={2}
            sx={{ mt: 2 }}
          />
        )}
      </DialogContent>
      {/* Si no entran en una fila (teléfono), el botón pasa abajo entero: nunca con el texto partido. */}
      <DialogActions
        sx={{
          px: 3,
          pb: 3,
          gap: 1,
          flexWrap: 'wrap',
          '& .MuiButton-root': { whiteSpace: 'nowrap' },
        }}
      >
        <Boton variante="texto" onClick={alCancelar} disabled={cargando}>
          {textoCancelar}
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
