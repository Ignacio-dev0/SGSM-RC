import { useEffect, useState, type FormEvent } from 'react';
import { Paper } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import { pacientesApi, usePaciente, type DatosPaciente } from '../../api/pacientes';
import { AccionesFormulario } from '../../componentes/AccionesFormulario';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { CamposPaciente } from './CamposPaciente';
import {
  PACIENTE_VACIO,
  datosDePaciente,
  validarPaciente,
  type ErroresPaciente,
} from './datosPaciente';
import { hayDiferencias, useCambiosSinGuardar } from '../../utilidades/useCambiosSinGuardar';
import { useFocoEnPrimerError } from '../../utilidades/useFocoEnPrimerError';

/** Modificación de los datos personales del paciente (T207 · CU13). */
export function EdicionPaciente() {
  const id = Number(useParams().id);
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const paciente = usePaciente(id);
  const [datos, setDatos] = useState<DatosPaciente>(PACIENTE_VACIO);
  const [errores, setErrores] = useState<ErroresPaciente>({});
  const { ref: refFormulario, enfocarPrimerError } = useFocoEnPrimerError<HTMLFormElement>();

  useEffect(() => {
    if (paciente.data) setDatos(datosDePaciente(paciente.data));
  }, [paciente.data]);

  // Cambios respecto de lo cargado: volver al valor original deja de contar como cambio.
  const { dialogo, permitirSalida } = useCambiosSinGuardar(
    Boolean(paciente.data) && hayDiferencias(datos, datosDePaciente(paciente.data!)),
  );

  const guardar = useMutation({
    mutationFn: () => pacientesApi.modificar(id, datos),
    onSuccess: async (p) => {
      clienteQuery.setQueryData(['paciente', id], p);
      await clienteQuery.invalidateQueries({ queryKey: ['pacientes'] });
      permitirSalida();
      navegar(`/pacientes/${id}`, { state: { aviso: 'Los cambios se guardaron' } });
    },
    onError: (err) => {
      const porCampo: ErroresPaciente = erroresPorCampo(err);
      if (err instanceof ErrorApi && err.codigo === 'DNI_DUPLICADO') porCampo.dni = err.message;
      setErrores(porCampo);
      enfocarPrimerError();
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const faltan = validarPaciente(datos);
    setErrores(faltan);
    enfocarPrimerError();
    if (Object.keys(faltan).length === 0) guardar.mutate();
  };

  const p = paciente.data;
  return (
    <>
      <EncabezadoPagina
        titulo={p ? `Editar: ${p.apellido}, ${p.nombre}` : 'Editar paciente'}
        volverA={`/pacientes/${id}`}
      />
      {guardar.isError && Object.keys(errores).length === 0 && (
        <Alerta tipo="error">{mensajeDeError(guardar.error)}</Alerta>
      )}
      {paciente.isError ? (
        <ErrorDeCarga
          que="los datos del paciente"
          error={paciente.error}
          alReintentar={() => void paciente.refetch()}
        />
      ) : !p ? (
        <Cargando texto="Cargando los datos del paciente…" />
      ) : (
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
          <AccionesFormulario>
            <Boton variante="texto" onClick={() => navegar(`/pacientes/${id}`)}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardar.isPending} disabled={!p}>
              Guardar
            </Boton>
          </AccionesFormulario>
        </Paper>
      )}
      {dialogo}
    </>
  );
}
