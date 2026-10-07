import { useState } from 'react';
import {
  Badge,
  Dialog,
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
import { formatearFechaHora } from '../utilidades/formato';

interface RespuestaNotificaciones {
  data: Notificacion[];
  meta: { noLeidas: number };
}

/** Avisos al usuario (bloqueos de cuentas, validaciones faciales fallidas): T112 · T407. */
export function CampanaNotificaciones() {
  const [abierta, setAbierta] = useState(false);
  const cliente = useQueryClient();
  const { data } = useQuery({
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
      <Dialog open={abierta} onClose={() => setAbierta(false)} fullWidth maxWidth="sm">
        <DialogTitle>Notificaciones</DialogTitle>
        <DialogContent>
          {data?.data.length ? (
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
                  sx={{ opacity: n.leida ? 0.6 : 1, pr: 18 }}
                >
                  <ListItemText
                    primary={n.mensaje}
                    secondary={formatearFechaHora(n.creadaEn)}
                    slotProps={{ primary: { sx: { fontWeight: n.leida ? 400 : 700 } } }}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary">No hay notificaciones.</Typography>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
