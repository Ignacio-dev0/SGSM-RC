import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mensajeDeError } from '../../api/cliente';
import { pacientesApi, useCamasLibres } from '../../api/pacientes';
import type { Paciente } from '../../api/tipos';
import { Alerta } from '../../componentes/Alerta';
import { CampoTexto } from '../../componentes/CampoTexto';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { Selector } from '../../componentes/Selector';
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

  return (
    <ModalConfirmacion
      abierto={abierto}
      titulo="Trasladar de cama"
      mensaje={`Cama actual: ${paciente.cama ? descripcionCama(paciente.cama) : 'sin cama'}`}
      textoConfirmar="Trasladar"
      cargando={trasladar.isPending}
      alConfirmar={() => {
        if (camaId) trasladar.mutate();
      }}
      alCancelar={alCerrar}
    >
      <Box sx={{ mt: 2 }}>
        {trasladar.isError && <Alerta tipo="error">{mensajeDeError(trasladar.error)}</Alerta>}
        <Selector
          etiqueta="Cama nueva"
          valor={camaId}
          alCambiar={setCamaId}
          textoVacio="Elegir una cama libre…"
          opciones={opcionesDeCamas(camas.data ?? [])}
        />
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

/** Baja del paciente con fecha, hora y motivo del egreso (T208 · CU14). */
export function DialogoEgreso({ paciente, abierto, alCerrar, alTerminar }: Props) {
  const clienteQuery = useQueryClient();
  const [fecha, setFecha] = useState(ahoraLocal);

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
        <Typography>
          Se liberará la cama, se suspenderán sus prescripciones vigentes y se cancelarán los
          estudios y recordatorios pendientes.
        </Typography>
      }
      textoConfirmar="Dar de alta"
      peligroso
      pedirMotivo
      etiquetaMotivo="Motivo del egreso"
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
          type="datetime-local"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
    </ModalConfirmacion>
  );
}
