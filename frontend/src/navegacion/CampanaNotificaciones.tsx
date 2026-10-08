import { useId, useRef, useState } from 'react';
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
import { api, mensajeDeError } from '../api/cliente';
import type { Notificacion } from '../api/tipos';
import { Alerta } from '../componentes/Alerta';
import { AyudaFlotante } from '../componentes/AyudaFlotante';
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
  const botonCerrar = useRef<HTMLButtonElement>(null);
  // C3: todas las del usuario de la sesión de una vez.
  const marcarTodas = useMutation({
    mutationFn: () => api.post<{ marcadas: number }>('/api/notificaciones/leer-todas', {}),
    onSuccess: () => {
      // El botón que tenía el foco desaparece: el foco pasa a Cerrar y no se pierde.
      botonCerrar.current?.focus();
      return cliente.invalidateQueries({ queryKey: ['notificaciones'] });
    },
  });
  const marcadas = marcarTodas.data?.marcadas;

  const data = consulta.data;
  const noLeidas = data?.meta.noLeidas ?? 0;

  return (
    <>
      <AyudaFlotante texto="Notificaciones">
        <IconButton
          color="inherit"
          aria-label={noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}
          onClick={() => setAbierta(true)}
        >
          <Badge badgeContent={noLeidas} color="error">
            <NotificationsOutlinedIcon />
          </Badge>
        </IconButton>
      </AyudaFlotante>
      <Dialog
        open={abierta}
        onClose={() => {
          setAbierta(false);
          marcarTodas.reset();
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby={titulo}
      >
        <DialogTitle id={titulo}>Notificaciones</DialogTitle>
        <DialogContent>
          {marcadas !== undefined && (
            <Alerta tipo="exito">
              {marcadas === 1 ? 'Se marcó 1 como leída.' : `Se marcaron ${marcadas} como leídas.`}
            </Alerta>
          )}
          {marcarTodas.isError && (
            <Alerta tipo="error">
              No se pudieron marcar como leídas. {mensajeDeError(marcarTodas.error)}
            </Alerta>
          )}
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
        <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap' }}>
          {noLeidas > 0 && (
            // A la izquierda, lejos de Cerrar (como Dar de baja en el catálogo).
            <Boton
              variante="secundario"
              cargando={marcarTodas.isPending}
              onClick={() => marcarTodas.mutate()}
              sx={{ mr: 'auto' }}
            >
              Marcar todas como leídas
            </Boton>
          )}
          <Boton
            ref={botonCerrar}
            variante="texto"
            onClick={() => {
              setAbierta(false);
              marcarTodas.reset();
            }}
          >
            Cerrar
          </Boton>
        </DialogActions>
      </Dialog>
    </>
  );
}
