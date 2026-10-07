import { useId, useState } from 'react';
import { Box, IconButton, List, ListItem, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RemoveIcon from '@mui/icons-material/Remove';
import { useQuery } from '@tanstack/react-query';
import { pacientesApi } from '../../api/pacientes';
import { CampoTexto } from '../../componentes/CampoTexto';
import { Selector } from '../../componentes/Selector';

/** Selector de paciente internado, con la cama primero para encontrarlo rápido. */
export function SelectorPaciente({
  valor,
  alCambiar,
  textoVacio = 'Elegir paciente…',
}: {
  valor: string;
  alCambiar: (v: string) => void;
  textoVacio?: string;
}) {
  const internados = useQuery({
    queryKey: ['pacientes', 'internados'],
    queryFn: () => pacientesApi.buscar({ estado: 'INTERNADO', porPagina: 100 }),
  });
  return (
    <Selector
      etiqueta="Paciente"
      valor={valor}
      alCambiar={alCambiar}
      textoVacio={internados.isLoading ? 'Cargando pacientes…' : textoVacio}
      error={
        internados.isError
          ? 'No se pudo cargar la lista de pacientes. Revise la conexión y vuelva a entrar a esta pantalla.'
          : undefined
      }
      opciones={(internados.data?.data ?? []).map((p) => ({
        valor: String(p.id),
        etiqueta: `${p.cama ? `${p.cama.numero} · ` : ''}${p.apellido}, ${p.nombre}`,
      }))}
    />
  );
}

export interface ItemCantidad {
  insumoId: number;
  nombre: string;
  unidad: string;
  /** Entero de 1 o más; 0 significa que el campo quedó vacío o en cero (no se puede confirmar). */
  cantidad: number;
}

const ERROR_CANTIDAD = 'Ingrese una cantidad de 1 o más';

/** Del texto escrito a una cantidad entera de 1 o más; 0 si no hay una cantidad válida. */
const aCantidad = (texto: string) => {
  const n = Math.trunc(Number(texto));
  return Number.isFinite(n) && n >= 1 ? n : 0;
};

interface PropsFila {
  item: ItemCantidad;
  /** Fija la cantidad tal cual (0 si el campo quedó sin una cantidad válida). */
  alFijar: (cantidad: number) => void;
  /** Suma o resta de a uno, sin bajar de 1. */
  alSumar: (delta: number) => void;
  alQuitar: () => void;
}

function FilaCantidad({ item, alFijar, alSumar, alQuitar }: PropsFila) {
  const idError = useId();
  // Mientras el campo tiene el foco se muestra lo que se escribe, sin corregirlo: al borrar un
  // "3" para escribir un "5" no puede quedar "15". Al salir vuelve a mostrar la cantidad válida.
  const [borrador, setBorrador] = useState<string | null>(null);
  const sinCantidad = item.cantidad < 1;
  const conError = sinCantidad && borrador === null;

  return (
    <ListItem divider sx={{ gap: 1, flexWrap: 'wrap', px: 0 }}>
      <Box sx={{ flex: '1 1 180px', minWidth: 0, overflowWrap: 'break-word' }}>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{item.nombre}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {item.unidad}
        </Typography>
      </Box>
      <IconButton
        aria-label={`Restar uno a ${item.nombre}`}
        onClick={() => {
          setBorrador(null);
          alSumar(-1);
        }}
      >
        <RemoveIcon />
      </IconButton>
      <CampoTexto
        etiqueta={`Cantidad de ${item.nombre}`}
        valor={borrador ?? (sinCantidad ? '' : String(item.cantidad))}
        alCambiar={(v) => {
          setBorrador(v);
          alFijar(aCantidad(v));
        }}
        onBlur={() => setBorrador(null)}
        type="number"
        sx={{ width: 110 }}
        slotProps={{
          htmlInput: {
            min: 1,
            inputMode: 'numeric',
            'aria-describedby': conError ? idError : undefined,
          },
          input: { error: conError },
          inputLabel: { sx: { display: 'none' } },
        }}
      />
      <IconButton
        aria-label={`Sumar uno a ${item.nombre}`}
        onClick={() => {
          setBorrador(null);
          alSumar(1);
        }}
      >
        <AddIcon />
      </IconButton>
      <IconButton aria-label={`Quitar ${item.nombre}`} onClick={alQuitar}>
        <DeleteOutlineIcon />
      </IconButton>
      {conError && (
        <Typography
          id={idError}
          role="alert"
          variant="body2"
          color="error"
          sx={{ flexBasis: '100%' }}
        >
          {ERROR_CANTIDAD}
        </Typography>
      )}
    </ListItem>
  );
}

/**
 * Lista de insumos con cantidades grandes y fáciles de tocar (T414 · T416). Una cantidad vacía o
 * en cero queda en 0 y se marca con un error: quien use la lista no debe dejar confirmar
 * mientras algún ítem tenga `cantidad < 1`.
 */
export function ListaCantidades({
  titulo,
  items,
  alCambiar,
}: {
  titulo: string;
  items: ItemCantidad[];
  alCambiar: (items: ItemCantidad[]) => void;
}) {
  const fijar = (insumoId: number, cantidad: number) =>
    alCambiar(items.map((i) => (i.insumoId === insumoId ? { ...i, cantidad } : i)));

  return (
    <List aria-label={titulo} disablePadding>
      {items.map((i) => (
        <FilaCantidad
          key={i.insumoId}
          item={i}
          alFijar={(cantidad) => fijar(i.insumoId, cantidad)}
          alSumar={(delta) => fijar(i.insumoId, Math.max(1, i.cantidad + delta))}
          alQuitar={() => alCambiar(items.filter((x) => x.insumoId !== i.insumoId))}
        />
      ))}
    </List>
  );
}
