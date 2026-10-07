import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Box,
  Chip,
  List,
  ListItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { usePaciente } from '../../api/pacientes';
import { prescripcionesApi, usePrescripcion } from '../../api/prescripciones';
import type { EstadoPrescripcion, Prescripcion } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { Selector } from '../../componentes/Selector';
import { formatearFechaHora, formatearHora } from '../../utilidades/formato';
import {
  ACCIONES,
  cambiosDe,
  desde,
  filasDeCambios,
  nombreConCama,
  type Edicion,
} from './edicionPrescripcion';
import { ESTADOS, FRECUENCIAS, VIAS, etiquetaVia, resumenPrescripcion } from './etiquetas';
import { motivoSinPaciente } from './estadoDelPaciente';
import { IdentidadOEstado } from './IdentidadOEstado';

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
  const paciente = usePaciente(p?.pacienteId ?? 0);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [confirmandoCambios, setConfirmandoCambios] = useState(false);
  const [cambioEstado, setCambioEstado] = useState<EstadoPrescripcion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const idMotivo = useId();

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

  if (consulta.isError) {
    return (
      <ErrorDeCarga
        que="la prescripción"
        error={consulta.error}
        alReintentar={() => void consulta.refetch()}
      />
    );
  }
  if (!p || !edicion) return <Cargando texto="Cargando la prescripción…" />;

  const gestiona = tienePermiso('prescripciones.gestionar');
  const editable = gestiona && p.estado === 'VIGENTE';
  const hayCambios = Object.keys(cambiosDe(p, edicion)).length > 0;
  const dosisInvalida = !(Number(edicion.dosis) > 0);
  // Por qué Guardar cambios está deshabilitado (UX-17), o null si se puede guardar.
  const motivoBloqueo =
    motivoSinPaciente(paciente) ??
    (dosisInvalida ? 'Revise la dosis' : hayCambios ? null : 'No hay cambios para guardar');
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
              // Solo finalizar es irreversible; suspender se puede reanudar.
              variante={estado === 'FINALIZADA' ? 'peligro' : 'secundario'}
              onClick={() => setCambioEstado(estado)}
            >
              {ACCIONES[estado as keyof typeof ACCIONES].boton}
            </Boton>
          ))
        }
      />
      <IdentidadOEstado consulta={paciente} />
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
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  columnGap: 2,
                  rowGap: 1,
                  mt: 3,
                }}
              >
                {motivoBloqueo && (
                  <Typography
                    id={idMotivo}
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: 'right' }}
                  >
                    {motivoBloqueo}
                  </Typography>
                )}
                <Boton
                  disabled={Boolean(motivoBloqueo)}
                  aria-describedby={motivoBloqueo ? idMotivo : undefined}
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
        mensaje={
          <>
            Paciente:{' '}
            <strong>
              {paciente.data ? `${paciente.data.apellido}, ${paciente.data.nombre}` : '—'}
            </strong>
            {paciente.data?.cama && (
              <>
                {' · '}
                <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                  Cama {paciente.data.cama.numero}
                </Box>
              </>
            )}
            . Los cambios quedan registrados con su motivo.
          </>
        }
        textoConfirmar="Guardar"
        pedirMotivo
        etiquetaMotivo="Motivo del cambio"
        cargando={modificar.isPending}
        alConfirmar={(motivo) => modificar.mutate(motivo ?? '')}
        alCancelar={() => setConfirmandoCambios(false)}
      >
        <Table
          size="small"
          aria-label="Cambios"
          sx={{ mt: 2, '& th, & td': { px: { xs: 1, sm: 2 } } }}
        >
          <TableHead>
            <TableRow>
              <TableCell>Dato</TableCell>
              <TableCell>Antes</TableCell>
              <TableCell>Después</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filasDeCambios(p, edicion).map((f) => (
              <TableRow key={f.campo}>
                <TableCell>{f.campo}</TableCell>
                <TableCell>{f.antes}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{f.despues}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {modificar.isError && <Alerta tipo="error">{mensajeDeError(modificar.error)}</Alerta>}
      </ModalConfirmacion>

      {cambioEstado && (
        <ModalConfirmacion
          abierto
          titulo={ACCIONES[cambioEstado as keyof typeof ACCIONES].titulo}
          mensaje={ACCIONES[cambioEstado as keyof typeof ACCIONES].mensaje(
            `${p.medicamento.nombre} ${resumenPrescripcion(p)} de ${nombreConCama(paciente.data)}`,
          )}
          textoConfirmar={ACCIONES[cambioEstado as keyof typeof ACCIONES].boton}
          peligroso={cambioEstado === 'FINALIZADA'}
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
