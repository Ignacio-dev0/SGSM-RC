import { useEffect, useRef, type ReactNode } from 'react';
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
  /**
   * Para avisos que piden una decisión (reingreso, prescripción duplicada): al aparecer se lleva
   * a la vista y toma el foco, porque suele mostrarse lejos del botón que se acaba de tocar.
   */
  enfocar?: boolean;
}

/**
 * Cartel de alerta estándar (T010). Los errores y advertencias interrumpen al lector de
 * pantalla (`role="alert"`); los mensajes de éxito e información se anuncian sin interrumpir
 * (`role="status"`).
 */
export function Alerta({ tipo, titulo, children, alCerrar, accion, enfocar = false }: Props) {
  const urgente = tipo === 'error' || tipo === 'advertencia';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enfocar) return;
    // El `?.` cubre entornos sin scrollIntoView (jsdom). El foco no vuelve a desplazar la página.
    ref.current?.scrollIntoView?.({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, [enfocar]);

  return (
    <Alert
      ref={ref}
      {...(enfocar ? { tabIndex: -1 } : {})}
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
