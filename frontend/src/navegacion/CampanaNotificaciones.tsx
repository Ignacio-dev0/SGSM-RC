import { useId, useState } from 'react';
import {
  Badge,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/cliente';
import type { Notificacion } from '../api/tipos';
import { Boton } from '../componentes/Boton';
import { Cargando, ErrorDeCarga } from '../componentes/EstadoDeCarga';
import { formatearFechaHora } from '../utilidades/formato';

interface RespuestaNotificaciones {
  data: Notificacion[];
  meta: { noLeidas: number };
}

/** Avisos al usuario (bloqueos de cuentas, validaciones faciales fallidas): T112 · T407. */
export function CampanaNotificaciones() {
  const [abierta, setAbierta] = useState(false);
  const titulo = useId();
  const cliente = useQueryClient();
  const consulta = useQuery({
    queryKey: ['notificaciones'],
    queryFn: async () => {
      const r = await api.lista<Notificacion>('/api/notificaciones');
      return r as unknown as RespuestaNotificaciones;
    },
    refetchInterval: 60_000,
  });
  const marcar = useMutation({
    mutationFn: (id: number) => api.patch(`/api/notificaciones/${id}/leida`, {}),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['notificaciones'] }),
  });

  const data = consulta.data;
  const noLeidas = data?.meta.noLeidas ?? 0;

  return (
    <>
      <IconButton
        color="inherit"
        aria-label={noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}
        onClick={() => setAbierta(true)}
      >
        <Badge badgeContent={noLeidas} color="error">
          <NotificationsOutlinedIcon />
        </Badge>
      </IconButton>
      <Dialog
        open={abierta}
        onClose={() => setAbierta(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby={titulo}
      >
        <DialogTitle id={titulo}>Notificaciones</DialogTitle>
        <DialogContent>
          {consulta.isError ? (
            <ErrorDeCarga
              que="las notificaciones"
              error={consulta.error}
              alReintentar={() => void consulta.refetch()}
            />
          ) : consulta.isLoading ? (
            <Cargando texto="Cargando notificaciones…" />
          ) : data?.data.length ? (
            <List>
              {data.data.map((n) => (
                <ListItem
                  key={n.id}
                  divider
                  secondaryAction={
                    !n.leida && (
                      <Boton variante="texto" onClick={() => marcar.mutate(n.id)}>
                        Marcar leída
                      </Boton>
                    )
                  }
                  // Lo leído se distingue por el peso y la etiqueta, nunca bajando el contraste.
                  sx={{ pr: n.leida ? 2 : 18 }}
                >
                  <ListItemText
                    primary={n.mensaje}
                    secondary={`${formatearFechaHora(n.creadaEn)}${n.leida ? ' · Leída' : ''}`}
                    slotProps={{ primary: { sx: { fontWeight: n.leida ? 400 : 700 } } }}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary">No hay notificaciones.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Boton variante="texto" onClick={() => setAbierta(false)}>
            Cerrar
          </Boton>
        </DialogActions>
      </Dialog>
    </>
  );
}
