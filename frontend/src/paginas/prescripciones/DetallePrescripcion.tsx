import { useEffect, useState, type ReactNode } from 'react';
import { Box, Chip, List, ListItem, Paper, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import {
  prescripcionesApi,
  usePrescripcion,
  type CambiosPrescripcion,
} from '../../api/prescripciones';
import type { EstadoPrescripcion, Prescripcion, Via } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { Selector } from '../../componentes/Selector';
import { formatearFechaHora, formatearHora } from '../../utilidades/formato';
import { ESTADOS, FRECUENCIAS, VIAS, aLocal, etiquetaVia, resumenPrescripcion } from './etiquetas';

interface Edicion {
  dosis: string;
  unidadDosis: string;
  frecuenciaHoras: string;
  via: string;
  fin: string;
  observaciones: string;
}

const desde = (p: Prescripcion): Edicion => ({
  dosis: String(p.dosis),
  unidadDosis: p.unidadDosis,
  frecuenciaHoras: String(p.frecuenciaHoras),
  via: p.via,
  fin: p.fechaFin ? aLocal(p.fechaFin) : '',
  observaciones: p.observaciones ?? '',
});

/** Solo los campos que cambiaron, con el formato de la API. */
function cambiosDe(p: Prescripcion, e: Edicion): Omit<CambiosPrescripcion, 'motivo'> {
  const original = desde(p);
  const c: Omit<CambiosPrescripcion, 'motivo'> = {};
  if (e.dosis !== original.dosis) c.dosis = Number(e.dosis);
  if (e.unidadDosis !== original.unidadDosis) c.unidadDosis = e.unidadDosis.trim();
  if (e.frecuenciaHoras !== original.frecuenciaHoras) c.frecuenciaHoras = Number(e.frecuenciaHoras);
  if (e.via !== original.via) c.via = e.via as Via;
  if (e.fin !== original.fin) c.fechaFin = e.fin ? new Date(e.fin).toISOString() : null;
  if (e.observaciones !== original.observaciones) c.observaciones = e.observaciones;
  return c;
}

const ACCIONES: Record<
  'SUSPENDIDA' | 'FINALIZADA' | 'VIGENTE',
  { boton: string; titulo: string; aviso: string }
> = {
  SUSPENDIDA: {
    boton: 'Suspender',
    titulo: 'Suspender la prescripción',
    aviso: 'La prescripción quedó suspendida',
  },
  FINALIZADA: {
    boton: 'Finalizar',
    titulo: 'Finalizar la prescripción',
    aviso: 'La prescripción quedó finalizada',
  },
  VIGENTE: {
    boton: 'Reanudar',
    titulo: 'Reanudar la prescripción',
    aviso: 'La prescripción volvió a estar vigente',
  },
};

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {etiqueta}
      </Typography>
      <Typography sx={{ fontWeight: 600 }}>{children || '—'}</Typography>
    </Box>
  );
}

/** Detalle y modificación de una prescripción (T306 · CU19). */
export function DetallePrescripcion() {
  const id = Number(useParams().id);
  const clienteQuery = useQueryClient();
  const { tienePermiso } = useSesion();
  const consulta = usePrescripcion(id);
  const p = consulta.data;
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [confirmandoCambios, setConfirmandoCambios] = useState(false);
  const [cambioEstado, setCambioEstado] = useState<EstadoPrescripcion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (p) setEdicion(desde(p));
  }, [p]);

  /** Actualiza el caché conservando la agenda (que solo trae el detalle). */
  const actualizar = (nueva: Prescripcion) => {
    clienteQuery.setQueryData<Prescripcion>(['prescripcion', id], (vieja) => ({
      ...nueva,
      agenda: nueva.estado === 'VIGENTE' ? (vieja?.agenda ?? []) : [],
    }));
    void clienteQuery.invalidateQueries({ queryKey: ['prescripciones', nueva.pacienteId] });
  };

  const modificar = useMutation({
    mutationFn: (motivo: string) =>
      prescripcionesApi.modificar(id, { ...cambiosDe(p!, edicion!), motivo }),
    onSuccess: (nueva) => {
      actualizar(nueva);
      setConfirmandoCambios(false);
      setAviso('Los cambios se guardaron');
    },
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ estado, motivo }: { estado: EstadoPrescripcion; motivo: string }) =>
      prescripcionesApi.cambiarEstado(id, estado, motivo),
    onSuccess: (nueva, { estado }) => {
      actualizar(nueva);
      setCambioEstado(null);
      setAviso(ACCIONES[estado].aviso);
    },
  });

  if (consulta.isError) return <Alerta tipo="error">{mensajeDeError(consulta.error)}</Alerta>;
  if (!p || !edicion) return null;

  const gestiona = tienePermiso('prescripciones.gestionar');
  const editable = gestiona && p.estado === 'VIGENTE';
  const hayCambios = Object.keys(cambiosDe(p, edicion)).length > 0;
  const dosisInvalida = !(Number(edicion.dosis) > 0);
  const transiciones: EstadoPrescripcion[] =
    p.estado === 'VIGENTE'
      ? ['SUSPENDIDA', 'FINALIZADA']
      : p.estado === 'SUSPENDIDA'
        ? ['VIGENTE', 'FINALIZADA']
        : [];
  const editar = (campo: keyof Edicion) => (valor: string) => {
    setAviso(null);
    setEdicion((e) => (e ? { ...e, [campo]: valor } : e));
  };

  return (
    <>
      <EncabezadoPagina
        titulo={`${p.medicamento.nombre} ${p.medicamento.presentacion}`.trim()}
        volverA={`/pacientes/${p.pacienteId}?pestana=prescripciones`}
        subtitulo={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
            <Chip label={ESTADOS[p.estado].etiqueta} color={ESTADOS[p.estado].color} />
            <span>
              {resumenPrescripcion(p)} · {etiquetaVia(p.via)} · Prescribió {p.prescriptor}
            </span>
          </Box>
        }
        acciones={
          gestiona &&
          transiciones.map((estado) => (
            <Boton
              key={estado}
              variante={estado === 'VIGENTE' ? 'secundario' : 'peligro'}
              onClick={() => setCambioEstado(estado)}
            >
              {ACCIONES[estado as keyof typeof ACCIONES].boton}
            </Boton>
          ))
        }
      />
      {aviso && (
        <Alerta tipo="exito" alCerrar={() => setAviso(null)}>
          {aviso}
        </Alerta>
      )}
      {p.motivoCambioEstado && p.estado !== 'VIGENTE' && (
        <Alerta tipo="info">Motivo: {p.motivoCambioEstado}</Alerta>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          {editable ? (
            <>
              <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
                Indicación
              </Typography>
              <Box
                sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}
              >
                <CampoTexto
                  etiqueta="Dosis"
                  valor={edicion.dosis}
                  alCambiar={editar('dosis')}
                  type="number"
                  error={dosisInvalida ? 'La dosis debe ser mayor a 0' : undefined}
                  slotProps={{ htmlInput: { inputMode: 'decimal', min: 0, step: 'any' } }}
                />
                <CampoTexto
                  etiqueta="Unidad"
                  valor={edicion.unidadDosis}
                  alCambiar={editar('unidadDosis')}
                />
                <Selector
                  etiqueta="Frecuencia"
                  valor={edicion.frecuenciaHoras}
                  alCambiar={editar('frecuenciaHoras')}
                  opciones={
                    FRECUENCIAS.some((x) => x.valor === edicion.frecuenciaHoras)
                      ? FRECUENCIAS
                      : [
                          ...FRECUENCIAS,
                          {
                            valor: edicion.frecuenciaHoras,
                            etiqueta: `Cada ${edicion.frecuenciaHoras} horas`,
                          },
                        ]
                  }
                />
                <Selector
                  etiqueta="Vía"
                  valor={edicion.via}
                  alCambiar={editar('via')}
                  opciones={VIAS}
                />
                <CampoTexto
                  etiqueta="Fin (opcional)"
                  valor={edicion.fin}
                  alCambiar={editar('fin')}
                  type="datetime-local"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <CampoTexto
                  etiqueta="Observaciones"
                  valor={edicion.observaciones}
                  alCambiar={editar('observaciones')}
                  multiline
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                <Boton
                  disabled={!hayCambios || dosisInvalida}
                  onClick={() => setConfirmandoCambios(true)}
                >
                  Guardar cambios
                </Boton>
              </Box>
            </>
          ) : (
            <Box
              sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}
            >
              <Dato etiqueta="Dosis">{resumenPrescripcion(p)}</Dato>
              <Dato etiqueta="Vía">{etiquetaVia(p.via)}</Dato>
              <Dato etiqueta="Inicio">{formatearFechaHora(p.fechaInicio)}</Dato>
              <Dato etiqueta="Fin">
                {p.fechaFin ? formatearFechaHora(p.fechaFin) : 'Sin fecha de fin'}
              </Dato>
              <Dato etiqueta="Observaciones">{p.observaciones}</Dato>
            </Box>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" component="h2">
            Próximas tomas (24 h)
          </Typography>
          {p.agenda && p.agenda.length > 0 ? (
            <List aria-label="Próximas tomas">
              {p.agenda.map((t) => (
                <ListItem key={t} divider>
                  {formatearHora(t)} · {formatearFechaHora(t).slice(0, 5)}
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary">No hay tomas programadas.</Typography>
          )}
          <Typography variant="h6" component="h2" sx={{ mt: 2 }}>
            Últimas administraciones
          </Typography>
          {p.ultimasAdministraciones.length > 0 ? (
            <List aria-label="Últimas administraciones">
              {p.ultimasAdministraciones.map((a) => (
                <ListItem key={a.id} divider>
                  {formatearFechaHora(a.fechaHora)} · {a.usuario}
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary">
              Todavía no se registraron administraciones.
            </Typography>
          )}
        </Paper>
      </Box>

      <ModalConfirmacion
        abierto={confirmandoCambios}
        titulo="Guardar cambios en la prescripción"
        mensaje="Los cambios quedan registrados con su motivo."
        textoConfirmar="Guardar"
        pedirMotivo
        etiquetaMotivo="Motivo del cambio"
        cargando={modificar.isPending}
        alConfirmar={(motivo) => modificar.mutate(motivo ?? '')}
        alCancelar={() => setConfirmandoCambios(false)}
      >
        {modificar.isError && <Alerta tipo="error">{mensajeDeError(modificar.error)}</Alerta>}
      </ModalConfirmacion>

      {cambioEstado && (
        <ModalConfirmacion
          abierto
          titulo={ACCIONES[cambioEstado as keyof typeof ACCIONES].titulo}
          mensaje={
            cambioEstado === 'VIGENTE'
              ? 'La prescripción vuelve a generar tomas desde ahora.'
              : 'Se cancelarán los recordatorios pendientes de esta prescripción.'
          }
          textoConfirmar={ACCIONES[cambioEstado as keyof typeof ACCIONES].boton}
          peligroso={cambioEstado !== 'VIGENTE'}
          pedirMotivo
          cargando={cambiarEstado.isPending}
          alConfirmar={(motivo) =>
            cambiarEstado.mutate({ estado: cambioEstado, motivo: motivo ?? '' })
          }
          alCancelar={() => setCambioEstado(null)}
        >
          {cambiarEstado.isError && (
            <Alerta tipo="error">{mensajeDeError(cambiarEstado.error)}</Alerta>
          )}
        </ModalConfirmacion>
      )}
    </>
  );
}
