import { useId, useState, type FormEvent } from 'react';
import { Box, List, ListItem, Paper, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import { usePaciente } from '../../api/pacientes';
import { prescripcionesApi, useCatalogo } from '../../api/prescripciones';
import type { Via } from '../../api/tipos';
import { AccionesFormulario } from '../../componentes/AccionesFormulario';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Selector } from '../../componentes/Selector';
import { proximasTomas } from '../../utilidades/agenda';
import { soltarAlGirarLaRueda } from '../../utilidades/campoNumerico';
import { formatearFechaHora, formatearHora } from '../../utilidades/formato';
import { useFocoEnPrimerError } from '../../utilidades/useFocoEnPrimerError';
import { FRECUENCIAS, VIAS, aLocal, etiquetaVia, resumenPrescripcion } from './etiquetas';
import { motivoSinPaciente } from './estadoDelPaciente';
import { IdentidadOEstado } from './IdentidadOEstado';

interface Formulario {
  insumoId: string;
  dosis: string;
  unidadDosis: string;
  frecuenciaHoras: string;
  via: string;
  inicio: string;
  fin: string;
  observaciones: string;
}

type Errores = Partial<Record<keyof Formulario, string>>;

interface Duplicada {
  dosis: number;
  unidadDosis: string;
  frecuenciaHoras: number;
  via: Via;
}

/**
 * La dosis se valida al salir del campo o al guardar, no en cada tecla: al escribir el "0" de
 * "0,5" todavía no es un error.
 */
function validarDosis(f: Formulario): Errores {
  return f.dosis !== '' && !(Number(f.dosis) > 0) ? { dosis: 'La dosis debe ser mayor a 0' } : {};
}

/** Validaciones en línea: se muestran mientras se escribe, no recién al guardar. */
function validarEnLinea(f: Formulario): Errores {
  const e: Errores = {};
  if (f.fin && f.inicio && new Date(f.fin) <= new Date(f.inicio)) {
    e.fin = 'La fecha de fin debe ser posterior al inicio';
  }
  return e;
}

function validarCompleto(f: Formulario): Errores {
  return {
    ...(f.insumoId ? {} : { insumoId: 'Elija el medicamento' }),
    ...(f.dosis === '' ? { dosis: 'Ingrese la dosis' } : {}),
    ...(f.unidadDosis.trim() ? {} : { unidadDosis: 'Ingrese la unidad' }),
    ...(f.frecuenciaHoras ? {} : { frecuenciaHoras: 'Elija la frecuencia' }),
    ...(f.via ? {} : { via: 'Elija la vía' }),
    ...(f.inicio ? {} : { inicio: 'Ingrese el inicio' }),
    ...validarDosis(f),
    ...validarEnLinea(f),
  };
}

/** Campo de la API → campo del formulario, para ubicar los errores del servidor. */
const CAMPO: Record<string, keyof Formulario> = { fechaInicio: 'inicio', fechaFin: 'fin' };

/** Carga de prescripción (T304 · CU17) con aviso de prescripción duplicada (T307). */
export function CargaPrescripcion() {
  const pacienteId = Number(useParams().id);
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const paciente = usePaciente(pacienteId);
  const medicamentos = useCatalogo('MEDICAMENTO');
  const [f, setF] = useState<Formulario>(() => ({
    insumoId: '',
    dosis: '',
    unidadDosis: '',
    frecuenciaHoras: '',
    via: '',
    inicio: aLocal(new Date()),
    fin: '',
    observaciones: '',
  }));
  const [errores, setErrores] = useState<Errores>({});
  const { ref: refFormulario, enfocarPrimerError } = useFocoEnPrimerError<HTMLFormElement>();
  const [duplicadas, setDuplicadas] = useState<Duplicada[] | null>(null);
  const motivoBloqueo = motivoSinPaciente(paciente);
  const idMotivo = useId();

  const cambiar = (campo: keyof Formulario) => (valor: string) => {
    setF((actual) => {
      const nuevo = { ...actual, [campo]: valor };
      if (campo === 'insumoId') {
        const med = medicamentos.data?.find((m) => String(m.id) === valor);
        if (med) nuevo.unidadDosis = med.unidadMedida;
      }
      setErrores((e) => ({ ...e, [campo]: undefined, ...validarEnLinea(nuevo) }));
      return nuevo;
    });
    setDuplicadas(null);
  };

  const guardar = useMutation({
    mutationFn: (confirmarDuplicada: boolean) =>
      prescripcionesApi.crear(pacienteId, {
        insumoId: Number(f.insumoId),
        dosis: Number(f.dosis),
        unidadDosis: f.unidadDosis.trim(),
        frecuenciaHoras: Number(f.frecuenciaHoras),
        via: f.via as Via,
        fechaInicio: new Date(f.inicio).toISOString(),
        fechaFin: f.fin ? new Date(f.fin).toISOString() : null,
        observaciones: f.observaciones,
        confirmarDuplicada,
      }),
    onSuccess: async (p) => {
      await clienteQuery.invalidateQueries({ queryKey: ['prescripciones', pacienteId] });
      navegar(`/pacientes/${pacienteId}?pestana=prescripciones`, {
        state: {
          aviso: `Prescripción cargada: ${p.medicamento.nombre} ${resumenPrescripcion(p)}`,
        },
      });
    },
    onError: (err) => {
      if (err instanceof ErrorApi && err.codigo === 'PRESCRIPCION_DUPLICADA') {
        setDuplicadas((err.detalles as { prescripciones: Duplicada[] }).prescripciones);
        return;
      }
      const porCampo: Errores = {};
      for (const [campo, mensaje] of Object.entries(erroresPorCampo(err))) {
        porCampo[CAMPO[campo] ?? (campo as keyof Formulario)] = mensaje;
      }
      setErrores(porCampo);
      enfocarPrimerError();
    },
  });

  // Al salir del campo de la dosis se avisa si no sirve; mientras se escribe no.
  const validarDosisAlSalir = () => setErrores((e) => ({ ...e, ...validarDosis(f) }));

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    // Sin ver a qué paciente se le indica no se guarda (el botón también está deshabilitado).
    if (motivoBloqueo) return;
    const faltan = validarCompleto(f);
    setErrores(faltan);
    enfocarPrimerError();
    if (Object.keys(faltan).length === 0) guardar.mutate(false);
  };

  const tomas = proximasTomas(
    f.inicio ? new Date(f.inicio).toISOString() : '',
    Number(f.frecuenciaHoras),
    f.fin ? new Date(f.fin).toISOString() : null,
    4,
  );
  const errorGeneral =
    guardar.isError && !duplicadas && Object.keys(errores).length === 0
      ? mensajeDeError(guardar.error)
      : null;

  return (
    <>
      <EncabezadoPagina
        titulo="Nueva prescripción"
        volverA={`/pacientes/${pacienteId}?pestana=prescripciones`}
      />
      <IdentidadOEstado consulta={paciente} />
      {errorGeneral && <Alerta tipo="error">{errorGeneral}</Alerta>}
      {duplicadas && (
        // Pide una decisión y aparece arriba, lejos del botón tocado: se lleva el foco (UX-12).
        <Alerta
          enfocar
          tipo="advertencia"
          titulo="Posible prescripción duplicada"
          accion={
            <Boton
              variante="secundario"
              cargando={guardar.isPending}
              onClick={() => guardar.mutate(true)}
            >
              Cargar igual
            </Boton>
          }
        >
          {mensajeDeError(guardar.error)}:{' '}
          {duplicadas.map((d) => `${resumenPrescripcion(d)} · ${etiquetaVia(d.via)}`).join('; ')}.
          Revise antes de continuar.
        </Alerta>
      )}

      <Paper
        ref={refFormulario}
        variant="outlined"
        component="form"
        noValidate
        onSubmit={enviar}
        sx={{ p: 3 }}
      >
        <Box
          sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' } }}
        >
          <Selector
            etiqueta="Medicamento"
            valor={f.insumoId}
            alCambiar={cambiar('insumoId')}
            error={
              errores.insumoId ??
              (medicamentos.isError
                ? 'No se pudo cargar la lista de medicamentos. Revise la conexión y vuelva a entrar a esta pantalla.'
                : undefined)
            }
            required
            textoVacio={medicamentos.isLoading ? 'Cargando medicamentos…' : 'Elegir…'}
            opciones={(medicamentos.data ?? []).map((m) => ({
              valor: String(m.id),
              etiqueta: `${m.nombre} — ${m.presentacion}`,
            }))}
          />
          <CampoTexto
            etiqueta="Dosis"
            valor={f.dosis}
            alCambiar={cambiar('dosis')}
            error={errores.dosis}
            // Reserva el renglón del aviso: si apareciera al salir del campo, correría el botón
            // Guardar justo cuando se lo está tocando y el toque se perdería.
            ayuda={' '}
            onBlur={validarDosisAlSalir}
            required
            type="number"
            slotProps={{
              htmlInput: {
                inputMode: 'decimal',
                min: 0,
                step: 'any',
                // La rueda del mouse no cambia la dosis (UX-19).
                onWheel: soltarAlGirarLaRueda,
              },
            }}
          />
          <CampoTexto
            etiqueta="Unidad"
            valor={f.unidadDosis}
            alCambiar={cambiar('unidadDosis')}
            error={errores.unidadDosis}
            required
          />
          <Selector
            etiqueta="Frecuencia"
            valor={f.frecuenciaHoras}
            alCambiar={cambiar('frecuenciaHoras')}
            error={errores.frecuenciaHoras}
            required
            textoVacio="Elegir…"
            opciones={FRECUENCIAS}
          />
          <Selector
            etiqueta="Vía"
            valor={f.via}
            alCambiar={cambiar('via')}
            error={errores.via}
            required
            textoVacio="Elegir…"
            opciones={VIAS}
          />
          <Box />
          <CampoTexto
            etiqueta="Inicio"
            valor={f.inicio}
            alCambiar={cambiar('inicio')}
            error={errores.inicio}
            required
            type="datetime-local"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <CampoTexto
            etiqueta="Fin (opcional)"
            valor={f.fin}
            alCambiar={cambiar('fin')}
            error={errores.fin}
            type="datetime-local"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
        <CampoTexto
          etiqueta="Observaciones"
          valor={f.observaciones}
          alCambiar={cambiar('observaciones')}
          multiline
          minRows={2}
          sx={{ mt: 2 }}
        />

        {tomas.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>Primeras tomas</Typography>
            <List
              dense
              aria-label="Primeras tomas"
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
            >
              {tomas.map((t, i) => (
                <ListItem
                  key={t.toISOString()}
                  sx={{ width: 'auto', bgcolor: 'background.default', borderRadius: 2 }}
                >
                  {i === 0 ? formatearFechaHora(t.toISOString()) : formatearHora(t.toISOString())}
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        <AccionesFormulario>
          {motivoBloqueo && (
            <Typography
              id={idMotivo}
              variant="body2"
              color="text.secondary"
              sx={{ flex: '1 1 auto', textAlign: { sm: 'right' } }}
            >
              {motivoBloqueo}
            </Typography>
          )}
          <Boton
            variante="texto"
            onClick={() => navegar(`/pacientes/${pacienteId}?pestana=prescripciones`)}
          >
            Cancelar
          </Boton>
          <Boton
            type="submit"
            disabled={Boolean(motivoBloqueo)}
            aria-describedby={motivoBloqueo ? idMotivo : undefined}
            cargando={guardar.isPending && !duplicadas}
          >
            Guardar prescripción
          </Boton>
        </AccionesFormulario>
      </Paper>
    </>
  );
}
