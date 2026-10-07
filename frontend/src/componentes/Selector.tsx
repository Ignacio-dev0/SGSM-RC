import { Box, TextField, type TextFieldProps } from '@mui/material';
import { Boton } from './Boton';

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
  /**
   * Para listas que se piden al servidor: si hay `error`, aparece "Reintentar" al lado del
   * selector, para volver a pedirla sin salir de la pantalla ni perder lo ya cargado.
   */
  alReintentar?: () => void;
  /** Se está volviendo a pedir la lista: el botón queda deshabilitado, con su indicador. */
  reintentando?: boolean;
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
  alReintentar,
  reintentando = false,
  ...resto
}: Props) {
  const campo = (
    <TextField
      {...resto}
      select
      fullWidth={Boolean(alReintentar) || resto.fullWidth}
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
  if (!alReintentar) return campo;

  // La estructura es la misma con y sin error: el campo no se vuelve a montar (y no pierde el
  // foco) cuando aparece o desaparece el botón.
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <Box sx={{ flex: '1 1 0', minWidth: 0 }}>{campo}</Box>
      {error && (
        // Del alto del campo (56 px), para que quede alineado con él y no con el aviso de abajo.
        <Boton
          variante="secundario"
          cargando={reintentando}
          onClick={alReintentar}
          sx={{ flexShrink: 0, minHeight: 56 }}
        >
          Reintentar
        </Boton>
      )}
    </Box>
  );
}
