import { TextField, type TextFieldProps } from '@mui/material';

export interface OpcionSelector {
  valor: string;
  etiqueta: string;
}

interface Props extends Omit<TextFieldProps, 'value' | 'onChange' | 'error' | 'label' | 'select'> {
  etiqueta: string;
  valor: string;
  opciones: OpcionSelector[];
  alCambiar: (valor: string) => void;
  error?: string | undefined;
  /** Texto de la opción vacía; si se omite, no se ofrece opción vacía. */
  textoVacio?: string;
}

/**
 * Selector estándar (T010). Usa el `<select>` nativo: en las tablets abre el selector del
 * sistema operativo, que es más cómodo de usar con el dedo que un menú desplegable.
 */
export function Selector({
  etiqueta,
  valor,
  opciones,
  alCambiar,
  error,
  textoVacio,
  ...resto
}: Props) {
  return (
    <TextField
      {...resto}
      select
      label={etiqueta}
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      error={Boolean(error)}
      helperText={error}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
    >
      {textoVacio !== undefined && <option value="">{textoVacio}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </TextField>
  );
}
