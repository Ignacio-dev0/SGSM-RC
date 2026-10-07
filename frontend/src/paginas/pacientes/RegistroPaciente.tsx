import { useState, type FormEvent } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import { pacientesApi, useCamasLibres, type DatosPaciente } from '../../api/pacientes';
import type { Paciente } from '../../api/tipos';
import { AccionesFormulario } from '../../componentes/AccionesFormulario';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Selector } from '../../componentes/Selector';
import { CamposPaciente } from './CamposPaciente';
import { PACIENTE_VACIO, validarPaciente, type ErroresPaciente } from './datosPaciente';
import { descripcionCama, opcionesDeCamas } from './etiquetas';
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
 */
export function RegistroPaciente() {
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const camas = useCamasLibres();
  const [datos, setDatos] = useState<DatosPaciente>(PACIENTE_VACIO);
  const [camaId, setCamaId] = useState('');
  const [errores, setErrores] = useState<ErroresPaciente>({});
  const { ref: refFormulario, enfocarPrimerError } = useFocoEnPrimerError<HTMLFormElement>();
  const [egresadoId, setEgresadoId] = useState<number | null>(null);
  const { dialogo, permitirSalida } = useCambiosSinGuardar(
    hayDiferencias(datos, PACIENTE_VACIO) || camaId !== '',
  );

  const alTerminar = async (p: Paciente, accion: string) => {
    await clienteQuery.invalidateQueries({ queryKey: ['pacientes'] });
    await clienteQuery.invalidateQueries({ queryKey: ['camas'] });
    permitirSalida();
    navegar(`/pacientes/${p.id}`, {
      state: { aviso: `${accion} en ${p.cama ? descripcionCama(p.cama) : 'la cama elegida'}` },
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
    mutationFn: () => pacientesApi.reingresar(egresadoId!, { ...datos, camaId: Number(camaId) }),
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
    if (Object.keys(faltan).length === 0) internar.mutate();
  };

  const errorGeneral =
    internar.isError && !egresadoId && Object.keys(errores).length === 0
      ? mensajeDeError(internar.error)
      : null;

  return (
    <>
      <EncabezadoPagina titulo="Internar paciente" volverA="/pacientes" />
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
            reintentando={camas.isFetching}
            required
            textoVacio={camas.isLoading ? 'Cargando camas…' : 'Elegir una cama libre…'}
            opciones={opcionesDeCamas(camas.data ?? [])}
          />
        </Box>

        <AccionesFormulario>
          <Boton variante="texto" onClick={() => navegar('/pacientes')}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={internar.isPending}>
            Internar
          </Boton>
        </AccionesFormulario>
      </Paper>
      {dialogo}
    </>
  );
}
