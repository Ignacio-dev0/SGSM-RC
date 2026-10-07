import { useState } from 'react';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Typography,
} from '@mui/material';
import FaceOutlinedIcon from '@mui/icons-material/FaceOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { biometriaApi } from '../../api/biometria';
import { mensajeDeError } from '../../api/cliente';
import { CapturaRostro, type RostroCapturado } from '../../biometria/CapturaRostro';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { formatearFechaHora } from '../../utilidades/formato';

/**
 * Registro (CU07), actualización (CU08) y eliminación (CU09) del rostro de un usuario por parte
 * del administrador (T406).
 */
export function RostroUsuario() {
  const id = Number(useParams().id);
  const clienteQuery = useQueryClient();
  const consulta = useQuery({
    queryKey: ['biometria', id],
    queryFn: () => biometriaApi.estado(id),
  });
  const [capturando, setCapturando] = useState(false);
  const [captura, setCaptura] = useState<RostroCapturado | null>(null);
  const [intento, setIntento] = useState(0);
  const [eliminando, setEliminando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const refrescar = () => {
    void clienteQuery.invalidateQueries({ queryKey: ['biometria'] });
    void clienteQuery.invalidateQueries({ queryKey: ['usuarios'] });
  };

  const guardar = useMutation({
    mutationFn: (c: RostroCapturado) =>
      biometriaApi.registrar(id, { patron: c.descriptor, foto: c.foto }),
    onSuccess: () => {
      // La captura se limpia al terminar de cerrarse el diálogo (onExited), no antes.
      setCapturando(false);
      setAviso('Rostro registrado. Ya puede confirmar operaciones con su cara.');
      refrescar();
    },
  });
  const eliminar = useMutation({
    mutationFn: () => biometriaApi.eliminar(id),
    onSuccess: () => {
      setEliminando(false);
      setAviso('Los datos biométricos se eliminaron.');
      refrescar();
    },
  });

  if (consulta.isError) {
    return (
      <ErrorDeCarga
        que="el registro facial"
        error={consulta.error}
        alReintentar={() => void consulta.refetch()}
      />
    );
  }
  const u = consulta.data;
  if (!u) return <Cargando texto="Cargando el registro facial…" />;
  const nombre = `${u.nombre} ${u.apellido}`;

  return (
    <>
      <EncabezadoPagina
        titulo={`${u.apellido}, ${u.nombre}`}
        subtitulo={`${u.rol} · ${u.nombreUsuario}`}
        volverA="/biometria"
      />
      {aviso && (
        <Alerta tipo="exito" alCerrar={() => setAviso(null)}>
          {aviso}
        </Alerta>
      )}
      <Paper
        variant="outlined"
        sx={{ p: 3, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <Box
          sx={{
            width: 160,
            height: 160,
            borderRadius: 3,
            bgcolor: 'background.default',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          {u.registrado ? (
            <img
              src={biometriaApi.urlFoto(id, u.actualizadoEn)}
              alt={`Foto de referencia de ${nombre}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <FaceOutlinedIcon sx={{ fontSize: 72, color: 'text.secondary' }} />
          )}
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="p">
            {u.registrado ? 'Rostro registrado' : 'Sin rostro registrado'}
          </Typography>
          <Typography color="text.secondary">
            {u.registrado
              ? `Última actualización: ${formatearFechaHora(u.actualizadoEn)}`
              : 'Hasta que se registre, no podrá confirmar suministros con su cara.'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            <Boton onClick={() => setCapturando(true)}>
              {u.registrado ? 'Actualizar rostro' : 'Registrar rostro'}
            </Boton>
            {u.registrado && (
              <Boton variante="peligro" onClick={() => setEliminando(true)}>
                Eliminar datos biométricos
              </Boton>
            )}
          </Box>
        </Box>
      </Paper>

      <Dialog
        open={capturando}
        onClose={() => setCapturando(false)}
        slotProps={{ transition: { onExited: () => setCaptura(null) } }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="titulo-registro-rostro"
      >
        <DialogTitle id="titulo-registro-rostro">Registrar rostro de {nombre}</DialogTitle>
        <DialogContent>
          {guardar.isError && <Alerta tipo="error">{mensajeDeError(guardar.error)}</Alerta>}
          {captura ? (
            <Box sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
              <img
                src={captura.foto}
                alt="Foto capturada"
                style={{ maxWidth: 320, borderRadius: 12 }}
              />
              <Typography>¿Se ve bien la cara? Esta foto queda como referencia.</Typography>
            </Box>
          ) : (
            <CapturaRostro key={intento} persona={u.nombreUsuario} alCapturar={setCaptura} />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Boton variante="texto" onClick={() => setCapturando(false)}>
            Cancelar
          </Boton>
          {captura && (
            <>
              <Boton
                variante="secundario"
                onClick={() => {
                  setCaptura(null);
                  setIntento((i) => i + 1);
                }}
              >
                Volver a capturar
              </Boton>
              <Boton cargando={guardar.isPending} onClick={() => guardar.mutate(captura)}>
                Guardar
              </Boton>
            </>
          )}
        </DialogActions>
      </Dialog>

      <ModalConfirmacion
        abierto={eliminando}
        titulo="Eliminar datos biométricos"
        mensaje={`Se borrarán el patrón facial y la foto de referencia de ${nombre}. No podrá confirmar suministros hasta que se registre de nuevo.`}
        textoConfirmar="Eliminar"
        peligroso
        cargando={eliminar.isPending}
        alConfirmar={() => eliminar.mutate()}
        alCancelar={() => setEliminando(false)}
      >
        {eliminar.isError && <Alerta tipo="error">{mensajeDeError(eliminar.error)}</Alerta>}
      </ModalConfirmacion>
    </>
  );
}
