import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mensajeDeError } from '../../api/cliente';
import { pacientesApi, useCamasLibres } from '../../api/pacientes';
import type { Paciente } from '../../api/tipos';
import { Alerta } from '../../componentes/Alerta';
import { CampoTexto } from '../../componentes/CampoTexto';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { Selector } from '../../componentes/Selector';
import { formatearFechaHora } from '../../utilidades/formato';
import { descripcionCama, opcionesDeCamas } from './etiquetas';

interface Props {
  paciente: Paciente;
  abierto: boolean;
  alCerrar: () => void;
  alTerminar: (p: Paciente, aviso: string) => void;
}

/** Cambio de cama con registro del traslado (T207 · CU15). */
export function DialogoTraslado({ paciente, abierto, alCerrar, alTerminar }: Props) {
  const clienteQuery = useQueryClient();
  const camas = useCamasLibres(abierto);
  const [camaId, setCamaId] = useState('');

  useEffect(() => {
    if (!abierto) setCamaId('');
  }, [abierto]);

  const trasladar = useMutation({
    mutationFn: () => pacientesApi.trasladar(paciente.id, Number(camaId)),
    onSuccess: async (p) => {
      await clienteQuery.invalidateQueries({ queryKey: ['camas'] });
      alTerminar(p, `Paciente trasladado a ${p.cama ? descripcionCama(p.cama) : 'la cama nueva'}`);
    },
  });

  const sinCamas = camas.isSuccess && camas.data.length === 0;

  return (
    <ModalConfirmacion
      abierto={abierto}
      titulo="Trasladar de cama"
      mensaje={
        <Typography>
          <strong>
            {paciente.apellido}, {paciente.nombre}
          </strong>{' '}
          · DNI {paciente.dni}
          <br />
          Cama actual: {paciente.cama ? descripcionCama(paciente.cama) : 'sin cama'}. Al
          trasladarlo, esa cama queda libre.
        </Typography>
      }
      textoConfirmar="Trasladar"
      confirmarDeshabilitado={!camaId}
      cargando={trasladar.isPending}
      alConfirmar={() => trasladar.mutate()}
      alCancelar={alCerrar}
    >
      <Box sx={{ mt: 2 }}>
        {trasladar.isError && <Alerta tipo="error">{mensajeDeError(trasladar.error)}</Alerta>}
        {camas.isLoading && (
          <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1 }}>
            <CircularProgress size={24} />
            <Typography>Buscando camas libres…</Typography>
          </Box>
        )}
        {camas.isError && (
          <Alerta tipo="error">
            No se pudieron cargar las camas libres. {mensajeDeError(camas.error)}
          </Alerta>
        )}
        {sinCamas && (
          <Alerta tipo="info">
            No hay camas libres en este momento. Se puede trasladar cuando se libere una.
          </Alerta>
        )}
        {camas.isSuccess && !sinCamas && (
          <Selector
            etiqueta="Cama nueva"
            valor={camaId}
            alCambiar={setCamaId}
            textoVacio="Elegir una cama libre…"
            opciones={opcionesDeCamas(camas.data)}
          />
        )}
      </Box>
    </ModalConfirmacion>
  );
}

/** "AAAA-MM-DDTHH:mm" en hora local, para el campo datetime-local. */
function ahoraLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Error de la fecha de egreso, con las mismas reglas que el servidor. */
function errorDeFecha(fecha: string, fechaIngreso: string) {
  if (!fecha) return 'Indique la fecha y hora del egreso';
  const egreso = new Date(fecha);
  if (Number.isNaN(egreso.getTime())) return 'Indique la fecha y hora del egreso';
  // Un minuto de tolerancia: el campo no tiene segundos.
  if (egreso.getTime() > Date.now() + 60_000) return 'No puede ser posterior a ahora';
  if (egreso < new Date(fechaIngreso)) {
    return `No puede ser anterior al ingreso (${formatearFechaHora(fechaIngreso)})`;
  }
  return undefined;
}

/** Egreso del paciente ("Dar de alta") con fecha, hora y motivo (T208 · CU14). */
export function DialogoEgreso({ paciente, abierto, alCerrar, alTerminar }: Props) {
  const clienteQuery = useQueryClient();
  const [fecha, setFecha] = useState(ahoraLocal);
  const errorFecha = errorDeFecha(fecha, paciente.fechaIngreso);

  useEffect(() => {
    if (abierto) setFecha(ahoraLocal());
  }, [abierto]);

  const egresar = useMutation({
    mutationFn: (motivo: string) =>
      pacientesApi.egresar(paciente.id, {
        motivo,
        fechaEgreso: new Date(fecha).toISOString(),
      }),
    onSuccess: async (p) => {
      await clienteQuery.invalidateQueries({ queryKey: ['camas'] });
      alTerminar(p, 'El paciente quedó egresado y su cama se liberó');
    },
  });

  return (
    <ModalConfirmacion
      abierto={abierto}
      titulo="Dar de alta al paciente"
      mensaje={
        <>
          <Typography>
            Se da de alta a{' '}
            <strong>
              {paciente.apellido}, {paciente.nombre}
            </strong>{' '}
            (DNI {paciente.dni}
            {paciente.cama ? `, cama ${paciente.cama.numero}` : ''}).
          </Typography>
          <Typography sx={{ mt: 1 }}>
            Se liberará la cama, se suspenderán sus prescripciones vigentes y se cancelarán los
            estudios y recordatorios pendientes. Si vuelve, se lo interna con Internar paciente y su
            DNI, y queda como reingreso en la misma ficha.
          </Typography>
        </>
      }
      textoConfirmar="Dar de alta"
      peligroso
      pedirMotivo
      etiquetaMotivo="Motivo del egreso"
      ayudaMotivo="Por ejemplo: alta médica, derivación a otro hospital, alta voluntaria"
      confirmarDeshabilitado={Boolean(errorFecha)}
      cargando={egresar.isPending}
      alConfirmar={(motivo) => egresar.mutate(motivo ?? '')}
      alCancelar={alCerrar}
    >
      <Box sx={{ mt: 2 }}>
        {egresar.isError && <Alerta tipo="error">{mensajeDeError(egresar.error)}</Alerta>}
        <CampoTexto
          etiqueta="Fecha y hora de egreso"
          valor={fecha}
          alCambiar={setFecha}
          error={errorFecha}
          type="datetime-local"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
    </ModalConfirmacion>
  );
}
