import type { ReactNode } from 'react';
import { Alert, AlertTitle, type AlertColor } from '@mui/material';

export type TipoAlerta = 'error' | 'advertencia' | 'exito' | 'info';

const severidad: Record<TipoAlerta, AlertColor> = {
  error: 'error',
  advertencia: 'warning',
  exito: 'success',
  info: 'info',
};

interface Props {
  tipo: TipoAlerta;
  titulo?: string;
  children: ReactNode;
  alCerrar?: () => void;
  /** Acción extra a la derecha (por ejemplo, "Continuar igual"). */
  accion?: ReactNode;
}

/**
 * Cartel de alerta estándar (T010). Los errores y advertencias interrumpen al lector de
 * pantalla (`role="alert"`); los mensajes de éxito e información se anuncian sin interrumpir
 * (`role="status"`).
 */
export function Alerta({ tipo, titulo, children, alCerrar, accion }: Props) {
  const urgente = tipo === 'error' || tipo === 'advertencia';
  return (
    <Alert
      severity={severidad[tipo]}
      role={urgente ? 'alert' : 'status'}
      onClose={alCerrar}
      action={accion}
      slotProps={{ closeButton: { 'aria-label': 'Cerrar', title: 'Cerrar' } }}
      sx={{ mb: 2 }}
    >
      {titulo && <AlertTitle>{titulo}</AlertTitle>}
      {children}
    </Alert>
  );
}
