import { useState, type ReactNode } from 'react';
import {
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { ErrorApi, api, mensajeDeError } from '../api/cliente';
import { useUsuario } from '../auth/useSesion';
import { Alerta } from '../componentes/Alerta';
import { Boton } from '../componentes/Boton';
import { CapturaRostro, type RostroCapturado } from './CapturaRostro';

type Respuesta =
  | { valido: true; validacionToken: string; similitud: number }
  | { valido: false; intentosRestantes: number; cancelada: boolean };

interface Props {
  operacion: string;
  /** Lo que se está confirmando (paciente, medicamento…), visible junto a la cámara. */
  detalle?: ReactNode;
  alValidar: (validacionToken: string) => void;
  alCancelar: () => void;
}

/** Largo máximo de la descripción de la operación que acepta el servidor (queda en la auditoría). */
const LARGO_OPERACION = 80;

const recortar = (texto: string) =>
  texto.length <= LARGO_OPERACION ? texto : `${texto.slice(0, LARGO_OPERACION - 1)}…`;

/**
 * Validación facial reutilizable (T405 · CU10): pide el rostro del usuario de la sesión, lo
 * valida en el backend y devuelve el comprobante que exige la operación. Tres fallos cancelan
 * la operación (T407). Se usa en suministros y, más adelante, en estudios.
 */
export function ModalValidacionFacial({ operacion, detalle, alValidar, alCancelar }: Props) {
  const usuario = useUsuario();
  const [intento, setIntento] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [final, setFinal] = useState<string | null>(
    usuario.tieneBiometria
      ? null
      : 'Usted no tiene el rostro registrado, así que no puede confirmar esta operación. Pídale al administrador que lo registre.',
  );

  const validar = async ({ descriptor }: RostroCapturado) => {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await api.post<Respuesta>('/api/biometria/validar', {
        patron: descriptor,
        operacion: recortar(operacion),
      });
      if (r.valido) {
        alValidar(r.validacionToken);
        return;
      }
      if (r.cancelada) {
        setFinal(
          'Se canceló la operación por tres validaciones fallidas. Quedó registrado y se avisó al administrador.',
        );
        return;
      }
      setAviso(
        `No se reconoció su rostro. Le quedan ${r.intentosRestantes} ${r.intentosRestantes === 1 ? 'intento' : 'intentos'}.`,
      );
      setIntento((i) => i + 1);
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'SIN_BIOMETRIA') setFinal(e.message);
      else {
        setAviso(mensajeDeError(e));
        setIntento((i) => i + 1);
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog
      open
      onClose={enviando ? undefined : alCancelar}
      fullWidth
      maxWidth="sm"
      aria-labelledby="titulo-validacion"
    >
      <DialogTitle id="titulo-validacion">
        Confirmar con su rostro
        <Typography color="text.secondary">{operacion}</Typography>
      </DialogTitle>
      <DialogContent>
        {detalle && (
          <Box
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.default',
            }}
          >
            {detalle}
          </Box>
        )}
        {final ? (
          <Alerta tipo="error">{final}</Alerta>
        ) : (
          <>
            {aviso && <Alerta tipo="error">{aviso}</Alerta>}
            {enviando ? (
              <Box sx={{ display: 'grid', placeItems: 'center', py: 6, gap: 2 }}>
                <CircularProgress />
                <Typography>Verificando…</Typography>
              </Box>
            ) : (
              <CapturaRostro
                key={intento}
                persona={usuario.nombreUsuario}
                alCapturar={(r) => void validar(r)}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        {final ? (
          <Boton onClick={alCancelar}>Entendido</Boton>
        ) : (
          <Boton variante="texto" onClick={alCancelar} disabled={enviando}>
            Cancelar
          </Boton>
        )}
      </DialogActions>
    </Dialog>
  );
}
