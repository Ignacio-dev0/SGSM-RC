import { Box, CircularProgress, Typography } from '@mui/material';
import { mensajeDeError } from '../api/cliente';
import { Alerta } from './Alerta';
import { Boton } from './Boton';

/** Mientras llegan los datos: nunca una pantalla en blanco (T010). */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
      <CircularProgress size={28} />
      <Typography>{texto}</Typography>
    </Box>
  );
}

/**
 * Cuando los datos no llegaron: dice qué faltó y por qué, y deja reintentar. Así un fallo no
 * se confunde con "no hay datos" (por ejemplo, "el paciente no tiene prescripciones").
 */
export function ErrorDeCarga({
  que,
  error,
  alReintentar,
}: {
  /** Qué no se pudo cargar, con artículo: "la ficha del paciente", "las prescripciones". */
  que: string;
  error: unknown;
  alReintentar: () => void;
}) {
  const verbo = /^(los|las) /.test(que) ? 'pudieron' : 'pudo';
  return (
    <Alerta
      tipo="error"
      accion={
        <Boton variante="texto" onClick={alReintentar}>
          Reintentar
        </Boton>
      }
    >
      No se {verbo} cargar {que}. {mensajeDeError(error)}
    </Alerta>
  );
}
