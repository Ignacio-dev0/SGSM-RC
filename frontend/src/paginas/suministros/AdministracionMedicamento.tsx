import { useEffect, useId, useRef, useState } from 'react';
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
import { AccionesFormulario } from '../../componentes/AccionesFormulario';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { soltarAlGirarLaRueda } from '../../utilidades/campoNumerico';
import { formatearHora } from '../../utilidades/formato';
import { useAhora } from '../../utilidades/useAhora';
import { IdentidadPaciente } from '../pacientes/IdentidadPaciente';
import { etiquetaVia, formatearDosis } from '../prescripciones/etiquetas';
import { SelectorPaciente } from './comunes';
import { duracion, estadoToma } from './estadoToma';
import { ResumenAdministracion } from './ResumenAdministracion';
import { TarjetaPrescripcion } from './TarjetaPrescripcion';

/** Ancho máximo de la única columna de la pantalla: selector, paciente, tarjetas y formulario. */
const ANCHO_COLUMNA = 760;

/** Cierra la oración sin duplicar el punto final. */
const conPunto = (texto: string) => (texto.endsWith('.') ? texto : `${texto}.`);

/**
 * Botonera final de la pantalla. Cuando el botón está deshabilitado dice por qué (`ayuda`), junto
 * a él y también para el lector de pantalla, para que no parezca roto.
 */
function BotonConfirmar({
  habilitado,
  cargando,
  ayuda,
  alConfirmar,
}: {
  habilitado: boolean;
  cargando: boolean;
  ayuda: string | null;
  alConfirmar: () => void;
}) {
  const ayudaId = useId();
  return (
    <AccionesFormulario>
      {ayuda && (
        <Typography
          id={ayudaId}
          color="text.secondary"
          sx={{ flex: '1 1 auto', textAlign: { sm: 'right' } }}
        >
          {ayuda}
        </Typography>
      )}
      <Boton
        startIcon={<FaceRetouchingNaturalIcon />}
        disabled={!habilitado}
        cargando={cargando}
        onClick={alConfirmar}
        aria-describedby={ayuda ? ayudaId : undefined}
      >
        Confirmar con mi rostro
      </Boton>
    </AccionesFormulario>
  );
}

/** A quién se intentó registrar: el aviso de un fallo habla de él aunque la pantalla ya muestre a otro. */
interface Intento {
  pacienteId: number;
  nombre: string;
}

/**
 * Administración de medicamento (T413 · CU20): la pantalla más usada del sistema. Paciente →
 * prescripción vigente → cantidad → revisar → confirmación con el rostro. Los avisos (dosis
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
  const [intento, setIntento] = useState<Intento | null>(null);
  // Hay un registro sin respuesta: al cambiar de paciente no se descarta, para no perder el aviso si falla.
  const registrando = useRef(false);
  // Contenedor de los avisos del resultado: se lleva a la vista y recibe el foco al aparecer.
  const resultado = useRef<HTMLDivElement>(null);

  const limpiarFormulario = () => {
    setCantidad('');
    setObservaciones('');
    setOtraToma(false);
  };

  const registrar = useMutation({
    mutationFn: suministrosApi.administrar,
    onSuccess: (s) => {
      setRegistrado(s);
      setElegidaId(null);
      limpiarFormulario();
    },
    onSettled: () => {
      registrando.current = false;
      // También tras un error: si el registro llegó a guardarse, la tarjeta pasa a "ya se dio".
      void clienteQuery.invalidateQueries({ queryKey: ['prescripciones', pacienteId] });
      void clienteQuery.invalidateQueries({ queryKey: ['suministros'] });
    },
  });
  const { reset: reiniciarRegistro } = registrar;

  // Al cambiar de paciente no queda nada del anterior (ni la nota, ni la cantidad, ni el aviso).
  useEffect(() => {
    setElegidaId(null);
    setRegistrado(null);
    setCantidad('');
    setObservaciones('');
    setOtraToma(false);
    if (!registrando.current) reiniciarRegistro();
  }, [pacienteId, reiniciarRegistro]);

  // Si se llegó con "Administrar" desde una prescripción, queda elegida (una sola vez).
  const prescripcionPedida = Number(parametros.get('prescripcionId')) || 0;
  const yaPreelegida = useRef(false);
  useEffect(() => {
    if (yaPreelegida.current || !prescripcionPedida) return;
    const pedida = vigentes.data?.find((x) => x.id === prescripcionPedida);
    if (!pedida) return;
    yaPreelegida.current = true;
    setElegidaId(pedida.id);
    setCantidad(String(pedida.dosis));
  }, [prescripcionPedida, vigentes.data]);

  // El resultado puede quedar fuera de la vista (arriba, con varias tarjetas) y al registrar bien
  // el formulario desaparece con el foco: se lo lleva a la vista y se le da el foco.
  useEffect(() => {
    if (!registrado && !registrar.error) return;
    resultado.current?.scrollIntoView?.({ block: 'center' });
    resultado.current?.focus({ preventScroll: true });
  }, [registrado, registrar.error]);

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
  // Por qué no se puede confirmar (la cantidad inválida ya lo dice su propio campo).
  const ayudaConfirmar = !elegida
    ? 'Elija el medicamento que va a dar'
    : estado?.tipo === 'dada' && !otraToma
      ? 'Marque «Corresponde dar otra toma» para continuar'
      : null;

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
    if (!token) return;
    setIntento({
      pacienteId: p.id,
      nombre: `${p.apellido}, ${p.nombre}${p.cama ? ` (cama ${p.cama.numero})` : ''}`,
    });
    registrando.current = true;
    registrar.mutate({
      pacienteId: p.id,
      prescripcionId: elegida.id,
      cantidad: cantidadNumero,
      observaciones,
      validacionToken: token,
    });
  };

  // Solo una respuesta 4xx asegura que no se registró; sin conexión, 5xx o cortes pudo guardarse.
  const rechazada =
    registrar.error instanceof ErrorApi &&
    registrar.error.estado >= 400 &&
    registrar.error.estado < 500;
  const noSeSabe = registrar.isError && !rechazada;
  const cargando = pacienteId > 0 && (paciente.isLoading || vigentes.isLoading);
  const hayTarjetas = (vigentes.data?.length ?? 0) > 0;

  return (
    <>
      <EncabezadoPagina
        titulo="Administrar medicamento"
        volverA={pacienteId ? `/pacientes/${pacienteId}?pestana=prescripciones` : '/suministros'}
      />
      <Box sx={{ maxWidth: ANCHO_COLUMNA }}>
        <Box sx={{ mb: 2 }}>
          <SelectorPaciente
            valor={pacienteId ? String(pacienteId) : ''}
            alCambiar={(v) => setParametros(v ? { pacienteId: v } : {}, { replace: true })}
          />
        </Box>

        {(registrado || registrar.isError) && (
          <Box ref={resultado} tabIndex={-1}>
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
              (noSeSabe ? (
                <Alerta
                  tipo="error"
                  titulo="No se sabe si quedó registrada"
                  accion={
                    <Boton
                      variante="texto"
                      onClick={() =>
                        navegar(`/pacientes/${intento?.pacienteId ?? pacienteId}?pestana=historial`)
                      }
                    >
                      Ver el historial
                    </Boton>
                  }
                >
                  El servidor no confirmó el registro, así que no se sabe si quedó registrada la
                  administración a {intento?.nombre ?? 'este paciente'}. Antes de volver a intentar,
                  revise el historial de ese paciente para no darla dos veces.
                </Alerta>
              ) : (
                <Alerta tipo="error">{mensajeDeError(registrar.error)}</Alerta>
              ))}
          </Box>
        )}

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
            {vigentes.isSuccess && !hayTarjetas && (
              <Alerta tipo="info">
                El paciente no tiene prescripciones vigentes. Los insumos no medicinales se
                registran desde Registrar insumos.
              </Alerta>
            )}
            {hayTarjetas && (
              <Typography color="text.secondary" sx={{ mb: 1 }}>
                Toque el medicamento que va a dar
              </Typography>
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
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, display: 'grid', gap: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: '200px 1fr' },
              }}
            >
              <CampoTexto
                etiqueta={`Cantidad (${elegida.unidadDosis})`}
                valor={cantidad}
                alCambiar={setCantidad}
                type="number"
                error={cantidadValida ? undefined : 'La cantidad debe ser mayor a 0'}
                ayuda={`Prescripto: ${formatearDosis(elegida.dosis, elegida.unidadDosis)}`}
                slotProps={{
                  htmlInput: {
                    inputMode: 'decimal',
                    min: 0,
                    step: 'any',
                    // La rueda del mouse no cambia la cantidad (UX-19).
                    onWheel: soltarAlGirarLaRueda,
                  },
                }}
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
            <BotonConfirmar
              habilitado={puedeConfirmar}
              cargando={registrar.isPending}
              ayuda={ayudaConfirmar}
              alConfirmar={() => void confirmar()}
            />
          </Paper>
        )}
        {!elegida && p && hayTarjetas && (
          <BotonConfirmar
            habilitado={false}
            cargando={false}
            ayuda={ayudaConfirmar}
            alConfirmar={() => undefined}
          />
        )}
      </Box>
      {modalValidacion}
    </>
  );
}
