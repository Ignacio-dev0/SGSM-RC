import { Button, CircularProgress, type ButtonProps } from '@mui/material';

export type VarianteBoton = 'principal' | 'secundario' | 'peligro' | 'texto';

interface Props extends Omit<ButtonProps, 'variant' | 'color'> {
  variante?: VarianteBoton;
  /** Deshabilita el botón y muestra un indicador mientras la acción está en curso. */
  cargando?: boolean;
}

const estilos: Record<VarianteBoton, Pick<ButtonProps, 'variant' | 'color'>> = {
  principal: { variant: 'contained', color: 'primary' },
  secundario: { variant: 'outlined', color: 'primary' },
  peligro: { variant: 'contained', color: 'error' },
  texto: { variant: 'text', color: 'primary' },
};

/** Botón táctil estándar (T010). */
export function Boton({
  variante = 'principal',
  cargando = false,
  disabled,
  children,
  ...resto
}: Props) {
  return (
    <Button
      {...estilos[variante]}
      {...resto}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      startIcon={cargando ? <CircularProgress size={20} color="inherit" /> : resto.startIcon}
    >
      {children}
    </Button>
  );
}
