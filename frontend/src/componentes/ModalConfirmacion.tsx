import { useEffect, useId, useState, type ReactNode } from 'react';
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
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
  /** Largo máximo del motivo (el del esquema del servidor); por defecto, 255. */
  maxMotivo?: number;
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

/** Máximo por defecto: el de todos los motivos del servidor (`.max(255)`). */
const MAXIMO_MOTIVO = 255;

/** El contador aparece al llegar a esta parte del máximo: antes no hace falta mirarlo. */
const UMBRAL_CONTADOR = 0.8;

/**
 * Ayuda del motivo con el contador "N/255" a la derecha, cuando se acerca al máximo (el campo
 * no deja escribir más y, sin el contador, el corte parecería una falla). Va dentro de la ayuda
 * del campo, así el lector de pantalla también lo oye.
 */
function AyudaConContador({
  texto,
  largo,
  maximo,
}: {
  texto: string;
  largo: number;
  maximo: number;
}) {
  if (largo < Math.floor(maximo * UMBRAL_CONTADOR)) return texto;
  return (
    <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <span>{texto}</span>{' '}
      <Box
        component="span"
        sx={{
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          // En el máximo se destaca: ahí es donde el campo deja de aceptar letras.
          ...(largo >= maximo && { fontWeight: 700, color: 'text.primary' }),
        }}
      >
        {`${largo}/${maximo}`}
      </Box>
    </Box>
  );
}

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
  maxMotivo = MAXIMO_MOTIVO,
  confirmarDeshabilitado = false,
  cargando = false,
  children,
  alConfirmar,
  alCancelar,
}: Props) {
  const idTitulo = useId();
  const idMensaje = useId();
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
      // El mensaje dice sobre qué se actúa y si se puede deshacer: se lee al abrir (E5-13).
      aria-describedby={idMensaje}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id={idTitulo}>{titulo}</DialogTitle>
      <DialogContent>
        {typeof mensaje === 'string' ? (
          <Typography id={idMensaje}>{mensaje}</Typography>
        ) : (
          <Box id={idMensaje}>{mensaje}</Box>
        )}
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
              <AyudaConContador
                texto={
                  ayudaMotivo
                    ? `${ayudaMotivo} (${REQUISITO_MOTIVO})`
                    : `Escriba el motivo (${REQUISITO_MOTIVO})`
                }
                largo={motivo.length}
                maximo={maxMotivo}
              />
            }
            required
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: maxMotivo } }}
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
