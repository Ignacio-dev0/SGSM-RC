import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link as EnlaceRouter, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import { pacientesApi, useCamasLibres, usePaciente, type DatosPaciente } from '../../api/pacientes';
import type { Paciente } from '../../api/tipos';
import { AccionesFormulario } from '../../componentes/AccionesFormulario';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Selector } from '../../componentes/Selector';
import { CamposPaciente } from './CamposPaciente';
import {
  PACIENTE_VACIO,
  datosDePaciente,
  soloCambios,
  soloConValor,
  validarPaciente,
  type ErroresPaciente,
} from './datosPaciente';
import { laCama, opcionesDeCamas } from './etiquetas';
import { hayDiferencias, useCambiosSinGuardar } from '../../utilidades/useCambiosSinGuardar';
import { useFocoEnPrimerError } from '../../utilidades/useFocoEnPrimerError';

/** Campo del formulario al que corresponde cada conflicto que informa el backend. */
const CAMPO_DEL_ERROR: Record<string, keyof ErroresPaciente> = {
  DNI_DUPLICADO: 'dni',
  CAMA_OCUPADA: 'camaId',
  CAMA_NO_HABILITADA: 'camaId',
};

/**
 * Registro de paciente (T205 · CU11 · CU15): datos personales y elección de la cama libre en el
 * mismo paso. Si el DNI es de un paciente egresado, ofrece registrar su reingreso (T204).
 *
 * Con `?reingreso=<id>` (desde la ficha de un egresado, F18) es el reingreso de esa persona: el
 * formulario viene con los datos de su ficha y al confirmar viajan la cama y solo lo que se
 * cambió, así lo que no se tocó queda como estaba.
 */
export function RegistroPaciente() {
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const camas = useCamasLibres();
  const [parametros] = useSearchParams();
  const reingresoId = Number(parametros.get('reingreso')) || 0;
  const ficha = usePaciente(reingresoId);
  const datosDeLaFicha = ficha.data ? datosDePaciente(ficha.data) : null;
  const [datos, setDatos] = useState<DatosPaciente>(PACIENTE_VACIO);
  const [camaId, setCamaId] = useState('');
  const [errores, setErrores] = useState<ErroresPaciente>({});
  const { ref: refFormulario, enfocarPrimerError } = useFocoEnPrimerError<HTMLFormElement>();
  const [egresadoId, setEgresadoId] = useState<number | null>(null);
  const { dialogo, permitirSalida } = useCambiosSinGuardar(
    hayDiferencias(datos, datosDeLaFicha ?? PACIENTE_VACIO) || camaId !== '',
  );

  // Los datos de la ficha se cargan una sola vez: después son los que edita la persona.
  const precargado = useRef(false);
  useEffect(() => {
    if (!ficha.data || precargado.current) return;
    precargado.current = true;
    setDatos(datosDePaciente(ficha.data));
  }, [ficha.data]);

  const alTerminar = async (p: Paciente, accion: string) => {
    await clienteQuery.invalidateQueries({ queryKey: ['pacientes'] });
    await clienteQuery.invalidateQueries({ queryKey: ['camas'] });
    clienteQuery.setQueryData(['paciente', p.id], p);
    permitirSalida();
    navegar(`/pacientes/${p.id}`, {
      state: { aviso: `${accion} en ${p.cama ? laCama(p.cama) : 'la cama elegida'}` },
    });
  };

  const alFallar = (err: unknown) => {
    const porCampo: ErroresPaciente = erroresPorCampo(err);
    if (err instanceof ErrorApi) {
      if (err.codigo === 'PACIENTE_EGRESADO') {
        setEgresadoId((err.detalles as { pacienteId: number }).pacienteId);
      }
      const campo = CAMPO_DEL_ERROR[err.codigo];
      if (campo) porCampo[campo] = err.message;
    }
    setErrores(porCampo);
    enfocarPrimerError();
  };

  const internar = useMutation({
    mutationFn: () => pacientesApi.crear({ ...datos, camaId: Number(camaId) }),
    onSuccess: (p) => alTerminar(p, 'Paciente internado'),
    onError: alFallar,
  });

  const reingresar = useMutation({
    mutationFn: () =>
      reingresoId
        ? pacientesApi.reingresar(reingresoId, {
            ...soloCambios(datos, datosDeLaFicha ?? PACIENTE_VACIO),
            camaId: Number(camaId),
          })
        : pacientesApi.reingresar(egresadoId!, { ...soloConValor(datos), camaId: Number(camaId) }),
    onSuccess: (p) => alTerminar(p, 'Reingreso registrado'),
    onError: alFallar,
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setEgresadoId(null);
    const faltan: ErroresPaciente = {
      ...validarPaciente(datos),
      ...(camaId ? {} : { camaId: 'Elija la cama' }),
    };
    setErrores(faltan);
    enfocarPrimerError();
    if (Object.keys(faltan).length > 0) return;
    if (reingresoId) reingresar.mutate();
    else internar.mutate();
  };

  const errorGeneral =
    (internar.isError && !egresadoId) || (reingresoId > 0 && reingresar.isError)
      ? Object.keys(errores).length === 0
        ? mensajeDeError(internar.error ?? reingresar.error)
        : null
      : null;
  const f = ficha.data;
  const volverA = reingresoId ? `/pacientes/${reingresoId}` : '/pacientes';

  if (reingresoId) {
    if (ficha.isError) {
      return (
        <>
          <EncabezadoPagina titulo="Reingreso" volverA={volverA} />
          <ErrorDeCarga
            que="la ficha del paciente"
            error={ficha.error}
            alReintentar={() => void ficha.refetch()}
          />
        </>
      );
    }
    if (!f) return <Cargando texto="Cargando la ficha del paciente…" />;
    if (f.estado === 'INTERNADO') {
      return (
        <>
          <EncabezadoPagina titulo={`Reingreso de ${f.apellido}, ${f.nombre}`} volverA={volverA} />
          <Alerta
            tipo="info"
            accion={
              <Button component={EnlaceRouter} to={volverA}>
                Ir a la ficha
              </Button>
            }
          >
            {f.apellido}, {f.nombre} tiene una internación en curso: no hace falta registrar el
            reingreso.
          </Alerta>
        </>
      );
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo={f ? `Reingreso de ${f.apellido}, ${f.nombre}` : 'Internar paciente'}
        subtitulo={
          f
            ? 'Se usa su misma ficha. Revise los datos y elija la cama: lo que no cambie queda como está.'
            : undefined
        }
        volverA={volverA}
      />
      {errorGeneral && <Alerta tipo="error">{errorGeneral}</Alerta>}
      {egresadoId && (
        // Pide una decisión y aparece arriba, lejos del botón tocado: se lleva el foco (UX-12).
        <Alerta
          enfocar
          tipo="advertencia"
          titulo="El paciente ya estuvo internado"
          accion={
            <Boton
              variante="secundario"
              cargando={reingresar.isPending}
              onClick={() => reingresar.mutate()}
            >
              Registrar reingreso
            </Boton>
          }
        >
          {mensajeDeError(internar.error)} Se usará su misma ficha, con los datos de este formulario
          y la cama elegida.
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
        <CamposPaciente
          datos={datos}
          errores={errores}
          alCambiar={(campo, valor) => {
            setDatos((d) => ({ ...d, [campo]: valor }));
            setErrores((e) => ({ ...e, [campo]: undefined }));
          }}
        />

        <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>
          Cama
        </Typography>
        <Box sx={{ maxWidth: { md: '50%' } }}>
          <Selector
            etiqueta="Cama"
            valor={camaId}
            alCambiar={(v) => {
              setCamaId(v);
              setErrores((e) => ({ ...e, camaId: undefined }));
            }}
            error={
              errores.camaId ??
              (camas.isError
                ? `No se pudo cargar la lista de camas. ${mensajeDeError(camas.error)}`
                : camas.isSuccess && camas.data.length === 0
                  ? 'No hay camas libres. Hay que liberar o habilitar una antes de internar.'
                  : undefined)
            }
            alReintentar={() => void camas.refetch()}
            errorDeCarga={camas.isError}
            reintentando={camas.isFetching}
            required
            textoVacio={camas.isLoading ? 'Cargando camas…' : 'Elegir una cama libre…'}
            opciones={opcionesDeCamas(camas.data ?? [])}
          />
        </Box>

        <AccionesFormulario>
          <Boton variante="texto" onClick={() => navegar(volverA)}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={reingresoId ? reingresar.isPending : internar.isPending}>
            {reingresoId ? 'Registrar reingreso' : 'Internar'}
          </Boton>
        </AccionesFormulario>
      </Paper>
      {dialogo}
    </>
  );
}
