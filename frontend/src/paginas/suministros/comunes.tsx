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
  cantidad: number;
}

/** Lista de insumos con cantidades grandes y fáciles de tocar (T414 · T416). */
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
    alCambiar(
      items.map((i) => (i.insumoId === insumoId ? { ...i, cantidad: Math.max(1, cantidad) } : i)),
    );

  return (
    <List aria-label={titulo} disablePadding>
      {items.map((i) => (
        <ListItem key={i.insumoId} divider sx={{ gap: 1, flexWrap: 'wrap', px: 0 }}>
          <Box sx={{ flexGrow: 1, minWidth: 160 }}>
            <Typography sx={{ fontWeight: 700 }}>{i.nombre}</Typography>
            <Typography variant="body2" color="text.secondary">
              {i.unidad}
            </Typography>
          </Box>
          <IconButton
            aria-label={`Restar uno a ${i.nombre}`}
            onClick={() => fijar(i.insumoId, i.cantidad - 1)}
          >
            <RemoveIcon />
          </IconButton>
          <CampoTexto
            etiqueta={`Cantidad de ${i.nombre}`}
            valor={String(i.cantidad)}
            alCambiar={(v) => fijar(i.insumoId, Number(v) || 1)}
            type="number"
            sx={{ width: 110 }}
            slotProps={{
              htmlInput: { min: 1, inputMode: 'numeric' },
              inputLabel: { sx: { display: 'none' } },
            }}
          />
          <IconButton
            aria-label={`Sumar uno a ${i.nombre}`}
            onClick={() => fijar(i.insumoId, i.cantidad + 1)}
          >
            <AddIcon />
          </IconButton>
          <IconButton
            aria-label={`Quitar ${i.nombre}`}
            onClick={() => alCambiar(items.filter((x) => x.insumoId !== i.insumoId))}
          >
            <DeleteOutlineIcon />
          </IconButton>
        </ListItem>
      ))}
    </List>
  );
}
