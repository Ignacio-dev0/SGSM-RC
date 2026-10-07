import { useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { mensajeDeError } from '../../api/cliente';
import { useRetardo } from '../../utilidades/useRetardo';

export interface Sugerencia {
  valor: string;
  etiqueta: string;
}

interface Props {
  etiqueta: string;
  /** El id elegido; vacío es "todos". */
  valor: string;
  /** Cómo se llama lo elegido cuando no está entre las sugerencias (un enlace guardado). */
  etiquetaDelValor: string;
  /** Qué se busca, para la caché ("pacientes", "personal"). */
  clave: string;
  /** Pide al servidor lo que coincide con el texto; el total dice si hay más que las sugeridas. */
  buscar: (texto: string) => Promise<{ sugerencias: Sugerencia[]; total: number }>;
  alCambiar: (valor: string) => void;
  /** Con qué se puede buscar ("apellido, nombre o DNI"). */
  ayuda: string;
}

/**
 * Filtro que busca en el servidor mientras se escribe (E6-09): con cientos de pacientes o de
 * personal, una lista fija se quedaría corta. Muestra hasta las primeras sugerencias y dice si hay
 * más; lo elegido se puede borrar para volver a "todos".
 */
export function BuscadorEnServidor({
  etiqueta,
  valor,
  etiquetaDelValor,
  clave,
  buscar,
  alCambiar,
  ayuda,
}: Props) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  // Lo último que se eligió, para nombrarlo aunque ya no esté entre las sugerencias.
  const [elegida, setElegida] = useState<Sugerencia | null>(null);
  const buscado = useRetardo(texto.trim());
  const consulta = useQuery({
    queryKey: ['auditoria', clave, buscado],
    queryFn: () => buscar(buscado),
    enabled: abierto,
    placeholderData: keepPreviousData,
  });

  const seleccion: Sugerencia | null = !valor
    ? null
    : elegida?.valor === valor
      ? elegida
      : { valor, etiqueta: etiquetaDelValor };
  const sugerencias = consulta.data?.sugerencias ?? [];
  const total = consulta.data?.total ?? 0;
  const ayudaConTotal =
    total > sugerencias.length ? `${ayuda} Se muestran ${sugerencias.length} de ${total}.` : ayuda;

  return (
    <Autocomplete
      options={sugerencias}
      value={seleccion}
      onChange={(_e, opcion) => {
        setElegida(opcion);
        alCambiar(opcion?.valor ?? '');
      }}
      onInputChange={(_e, escrito, motivo) => setTexto(motivo === 'input' ? escrito : '')}
      open={abierto}
      onOpen={() => setAbierto(true)}
      onClose={() => setAbierto(false)}
      // Filtra el servidor: lo que llega ya coincide con lo escrito.
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.etiqueta}
      isOptionEqualToValue={(o, v) => o.valor === v.valor}
      loading={consulta.isFetching}
      loadingText="Buscando…"
      noOptionsText={
        consulta.isError
          ? `No se pudo buscar. ${mensajeDeError(consulta.error)}`
          : buscado
            ? `No se encontró "${buscado}"`
            : 'No hay a quién elegir'
      }
      clearText={`Borrar ${etiqueta}`}
      openText={`Ver sugerencias de ${etiqueta}`}
      closeText="Cerrar las sugerencias"
      renderInput={(params) => (
        <TextField
          {...params}
          label={etiqueta}
          placeholder="Todos"
          helperText={ayudaConTotal}
          // "Todos" es lo que se está aplicando, como en los selectores de al lado: no va atenuado.
          sx={{ '& .MuiInputBase-input::placeholder': { opacity: 1, color: 'text.primary' } }}
          slotProps={{ inputLabel: { ...params.InputLabelProps, shrink: true } }}
        />
      )}
    />
  );
}
