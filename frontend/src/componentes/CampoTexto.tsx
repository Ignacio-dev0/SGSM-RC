import { TextField, type TextFieldProps } from '@mui/material';

interface Props extends Omit<TextFieldProps, 'value' | 'onChange' | 'error' | 'label'> {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  /** Mensaje de error; si está presente el campo se marca como inválido. */
  error?: string | undefined;
  /** Texto de ayuda que se muestra cuando no hay error. */
  ayuda?: string;
}

/** Campo de texto estándar (T010) con el error asociado accesiblemente al input. */
export function CampoTexto({ etiqueta, valor, alCambiar, error, ayuda, ...resto }: Props) {
  return (
    <TextField
      {...resto}
      label={etiqueta}
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      error={Boolean(error)}
      helperText={error ?? ayuda}
    />
  );
}
