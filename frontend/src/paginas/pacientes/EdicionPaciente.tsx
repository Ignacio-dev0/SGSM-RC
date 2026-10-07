import { useEffect, useState, type FormEvent } from 'react';
import { Box, Paper } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import { pacientesApi, usePaciente, type DatosPaciente } from '../../api/pacientes';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { CamposPaciente } from './CamposPaciente';
import {
  PACIENTE_VACIO,
  datosDePaciente,
  validarPaciente,
  type ErroresPaciente,
} from './datosPaciente';

/** Modificación de los datos personales del paciente (T207 · CU13). */
export function EdicionPaciente() {
  const id = Number(useParams().id);
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const paciente = usePaciente(id);
  const [datos, setDatos] = useState<DatosPaciente>(PACIENTE_VACIO);
  const [errores, setErrores] = useState<ErroresPaciente>({});

  useEffect(() => {
    if (paciente.data) setDatos(datosDePaciente(paciente.data));
  }, [paciente.data]);

  const guardar = useMutation({
    mutationFn: () => pacientesApi.modificar(id, datos),
    onSuccess: async (p) => {
      clienteQuery.setQueryData(['paciente', id], p);
      await clienteQuery.invalidateQueries({ queryKey: ['pacientes'] });
      navegar(`/pacientes/${id}`, { state: { aviso: 'Los cambios se guardaron' } });
    },
    onError: (err) => {
      const porCampo: ErroresPaciente = erroresPorCampo(err);
      if (err instanceof ErrorApi && err.codigo === 'DNI_DUPLICADO') porCampo.dni = err.message;
      setErrores(porCampo);
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const faltan = validarPaciente(datos);
    setErrores(faltan);
    if (Object.keys(faltan).length === 0) guardar.mutate();
  };

  const p = paciente.data;
  return (
    <>
      <EncabezadoPagina
        titulo={p ? `Editar: ${p.apellido}, ${p.nombre}` : 'Editar paciente'}
        volverA={`/pacientes/${id}`}
      />
      {paciente.isError && <Alerta tipo="error">{mensajeDeError(paciente.error)}</Alerta>}
      {guardar.isError && Object.keys(errores).length === 0 && (
        <Alerta tipo="error">{mensajeDeError(guardar.error)}</Alerta>
      )}
      <Paper variant="outlined" component="form" noValidate onSubmit={enviar} sx={{ p: 3 }}>
        <CamposPaciente
          datos={datos}
          errores={errores}
          alCambiar={(campo, valor) => {
            setDatos((d) => ({ ...d, [campo]: valor }));
            setErrores((e) => ({ ...e, [campo]: undefined }));
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 4 }}>
          <Boton variante="texto" onClick={() => navegar(`/pacientes/${id}`)}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={guardar.isPending} disabled={!p}>
            Guardar
          </Boton>
        </Box>
      </Paper>
    </>
  );
}
