import { useEffect, useState } from 'react';
import { Box, Checkbox, FormControlLabel, Paper, Typography } from '@mui/material';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi, mensajeDeError } from '../../api/cliente';
import { usePaciente } from '../../api/pacientes';
import { prescripcionesApi } from '../../api/prescripciones';
import { suministrosApi } from '../../api/suministros';
import type { Prescripcion, Suministro } from '../../api/tipos';
import { useValidacionFacial } from '../../biometria/useValidacionFacial';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { formatearHora } from '../../utilidades/formato';
import { useAhora } from '../../utilidades/useAhora';
import { IdentidadPaciente } from '../pacientes/IdentidadPaciente';
import { etiquetaVia, formatearDosis } from '../prescripciones/etiquetas';
import { SelectorPaciente } from './comunes';
import { duracion, estadoToma } from './estadoToma';
import { ResumenAdministracion } from './ResumenAdministracion';
import { TarjetaPrescripcion } from './TarjetaPrescripcion';

/** Cierra la oración sin duplicar el punto final. */
const conPunto = (texto: string) => (texto.endsWith('.') ? texto : `${texto}.`);

/**
 * Administración de medicamento (T413 · CU20): la pantalla más usada del sistema. Paciente →
 * prescripción vigente → cantidad → revisar → confirmación con la cara. Los avisos (dosis
 * distinta, toma ya dada, toma adelantada) no bloquean salvo la toma ya dada, que pide
 * confirmar a propósito que corresponde otra.
 */
export function AdministracionMedicamento() {
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const ahora = useAhora();
  const [parametros, setParametros] = useSearchParams();
  const pacienteId = Number(parametros.get('pacienteId')) || 0;
  const paciente = usePaciente(pacienteId);
  const vigentes = useQuery({
    queryKey: ['prescripciones', pacienteId, 'VIGENTE'],
    queryFn: () => prescripcionesApi.dePaciente(pacienteId, 'VIGENTE'),
    enabled: pacienteId > 0,
  });
  const { pedirValidacion, modalValidacion } = useValidacionFacial();
  const [elegidaId, setElegidaId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [otraToma, setOtraToma] = useState(false);
  const [registrado, setRegistrado] = useState<Suministro | null>(null);

  const limpiarFormulario = () => {
    setCantidad('');
    setObservaciones('');
    setOtraToma(false);
  };

  // Al cambiar de paciente no queda nada del anterior (ni la nota ni la cantidad).
  useEffect(() => {
    setElegidaId(null);
    setRegistrado(null);
    setCantidad('');
    setObservaciones('');
    setOtraToma(false);
  }, [pacienteId]);

  const registrar = useMutation({
    mutationFn: (validacionToken: string) =>
      suministrosApi.administrar({
        pacienteId,
        prescripcionId: elegidaId!,
        cantidad: Number(cantidad),
        observaciones,
        validacionToken,
      }),
    onSuccess: (s) => {
      setRegistrado(s);
      setElegidaId(null);
      limpiarFormulario();
    },
    onSettled: () => {
      // También tras un error: si el registro llegó a guardarse, la tarjeta pasa a "ya se dio".
      void clienteQuery.invalidateQueries({ queryKey: ['prescripciones', pacienteId] });
      void clienteQuery.invalidateQueries({ queryKey: ['suministros'] });
    },
  });

  const elegir = (x: Prescripcion) => {
    if (x.id === elegidaId) return;
    setElegidaId(x.id);
    limpiarFormulario();
    setCantidad(String(x.dosis));
    setRegistrado(null);
    registrar.reset();
  };

  const p = paciente.data;
  const elegida = vigentes.data?.find((x) => x.id === elegidaId) ?? null;
  const estado = elegida ? estadoToma(elegida, ahora) : null;
  const cantidadNumero = Number(cantidad);
  const cantidadValida = cantidadNumero > 0;
  const puedeConfirmar = cantidadValida && (estado?.tipo !== 'dada' || otraToma);

  const confirmar = async () => {
    if (!elegida || !p) return;
    const dar = `${elegida.medicamento.nombre} ${formatearDosis(cantidadNumero, elegida.unidadDosis)}`;
    const token = await pedirValidacion(
      `Administración de ${elegida.medicamento.nombre} a ${p.apellido}, ${p.nombre}`,
      <>
        <Typography sx={{ fontWeight: 700 }}>
          {dar} · {etiquetaVia(elegida.via)}
        </Typography>
        <Typography>
          {p.apellido}, {p.nombre} · DNI {p.dni}
          {p.cama ? ` · Cama ${p.cama.numero}` : ''}
        </Typography>
      </>,
    );
    if (token) registrar.mutate(token);
  };

  const sinConexion =
    registrar.error instanceof ErrorApi && registrar.error.codigo === 'SIN_CONEXION';
  const cargando = pacienteId > 0 && (paciente.isLoading || vigentes.isLoading);

  return (
    <>
      <EncabezadoPagina
        titulo="Administrar medicamento"
        volverA={pacienteId ? `/pacientes/${pacienteId}?pestana=prescripciones` : '/suministros'}
      />
      <Box sx={{ maxWidth: 520, mb: 2 }}>
        <SelectorPaciente
          valor={pacienteId ? String(pacienteId) : ''}
          alCambiar={(v) => setParametros(v ? { pacienteId: v } : {}, { replace: true })}
        />
      </Box>

      {registrado && (
        <Alerta
          tipo="exito"
          titulo="Administración registrada"
          accion={
            <Boton
              variante="texto"
              onClick={() => navegar(`/pacientes/${pacienteId}?pestana=prescripciones`)}
            >
              Ir a la ficha
            </Boton>
          }
        >
          Se registró {registrado.detalles[0]?.insumo}{' '}
          {formatearDosis(
            registrado.detalles[0]?.cantidad ?? 0,
            registrado.detalles[0]?.unidad ?? '',
          )}{' '}
          a {registrado.paciente.apellido}, {registrado.paciente.nombre}
          {registrado.paciente.cama ? ` (cama ${registrado.paciente.cama})` : ''} a las{' '}
          {conPunto(formatearHora(registrado.fechaHora))}
        </Alerta>
      )}
      {registrar.isError &&
        (sinConexion ? (
          <Alerta
            tipo="error"
            titulo="No se sabe si quedó registrada"
            accion={
              <Boton
                variante="texto"
                onClick={() => navegar(`/pacientes/${pacienteId}?pestana=historial`)}
              >
                Ver el historial
              </Boton>
            }
          >
            No hubo respuesta del servidor, así que no se sabe si quedó registrada. Antes de volver
            a intentar, revise el historial del paciente para no darla dos veces.
          </Alerta>
        ) : (
          <Alerta tipo="error">{mensajeDeError(registrar.error)}</Alerta>
        ))}

      {cargando && <Cargando texto="Cargando las prescripciones…" />}
      {paciente.isError && (
        <ErrorDeCarga
          que="el paciente"
          error={paciente.error}
          alReintentar={() => void paciente.refetch()}
        />
      )}

      {p && (
        <>
          <IdentidadPaciente paciente={p} />
          {vigentes.isError && (
            <ErrorDeCarga
              que="las prescripciones"
              error={vigentes.error}
              alReintentar={() => void vigentes.refetch()}
            />
          )}
          {vigentes.isSuccess && vigentes.data.length === 0 && (
            <Alerta tipo="info">
              El paciente no tiene prescripciones vigentes. Los insumos no medicinales se registran
              desde Registrar insumos.
            </Alerta>
          )}
          <Box sx={{ display: 'grid', gap: 1.5, mb: 3 }}>
            {(vigentes.data ?? []).map((x) => (
              <TarjetaPrescripcion
                key={x.id}
                p={x}
                ahora={ahora}
                elegida={elegidaId === x.id}
                alElegir={() => elegir(x)}
              />
            ))}
          </Box>
        </>
      )}

      {elegida && p && estado && (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2, maxWidth: 720 }}
        >
          <Box
            sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' } }}
          >
            <CampoTexto
              etiqueta={`Cantidad (${elegida.unidadDosis})`}
              valor={cantidad}
              alCambiar={setCantidad}
              type="number"
              error={cantidadValida ? undefined : 'La cantidad debe ser mayor a 0'}
              ayuda={`Prescripto: ${formatearDosis(elegida.dosis, elegida.unidadDosis)}`}
              slotProps={{ htmlInput: { inputMode: 'decimal', min: 0, step: 'any' } }}
            />
            <CampoTexto
              etiqueta="Observaciones"
              valor={observaciones}
              alCambiar={setObservaciones}
            />
          </Box>

          {cantidadValida && cantidadNumero !== elegida.dosis && (
            <Alerta tipo="advertencia">
              La cantidad {formatearDosis(cantidadNumero, elegida.unidadDosis)} es distinta de la
              dosis prescripta ({formatearDosis(elegida.dosis, elegida.unidadDosis)}). Verifique
              antes de confirmar.
            </Alerta>
          )}
          {estado.tipo === 'falta' && (
            <Alerta tipo="advertencia">
              Faltan {duracion(estado.minutos)} para la toma de las {formatearHora(estado.toma)}.
              Verifique que corresponda adelantarla.
            </Alerta>
          )}
          {estado.tipo === 'dada' && (
            <Box>
              <Alerta tipo="advertencia">
                Esta toma ya se dio a las {formatearHora(estado.fechaHora)} ({estado.usuario}).
                Revise el historial antes de registrar otra.
              </Alerta>
              <FormControlLabel
                control={
                  <Checkbox checked={otraToma} onChange={(e) => setOtraToma(e.target.checked)} />
                }
                label="Corresponde dar otra toma (por ejemplo, por indicación médica)"
              />
            </Box>
          )}

          <ResumenAdministracion
            paciente={p}
            prescripcion={elegida}
            cantidad={cantidadNumero}
            observaciones={observaciones}
            estado={estado}
          />
          <Boton
            startIcon={<FaceRetouchingNaturalIcon />}
            disabled={!puedeConfirmar}
            cargando={registrar.isPending}
            onClick={() => void confirmar()}
            sx={{ justifySelf: 'start' }}
          >
            Confirmar con mi rostro
          </Boton>
        </Paper>
      )}
      {!elegida && p && (vigentes.data?.length ?? 0) > 0 && (
        <Boton disabled startIcon={<FaceRetouchingNaturalIcon />}>
          Confirmar con mi rostro
        </Boton>
      )}
      {modalValidacion}
    </>
  );
}
