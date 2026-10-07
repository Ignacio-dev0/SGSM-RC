import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { ErrorApi } from '../../api/cliente';
import { estudiosApi, type Estudio } from '../../api/estudios';
import { Alerta } from '../../componentes/Alerta';
import { CampoTexto } from '../../componentes/CampoTexto';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { sinCortes } from '../../utilidades/formato';
import {
  aLocal,
  errorDeFecha,
  errorDelServidor,
  esNoProgramado,
  fechaYHora,
  identidad,
  type PacienteDelEstudio,
} from './etiquetas';
import {
  RESULTADO_NO_PROGRAMADO,
  useRefrescarEstudios,
  type ResultadoEstudio,
} from './useRefrescarEstudios';

interface Props {
  estudio: Estudio;
  paciente: PacienteDelEstudio;
  alCerrar: () => void;
  alTerminar: (r: ResultadoEstudio) => void;
}

/** Reprogramar (T512): solo cambia la fecha y hora de un estudio programado. */
export function DialogoReprogramarEstudio({ estudio: e, paciente, alCerrar, alTerminar }: Props) {
  const refrescar = useRefrescarEstudios();
  const actual = aLocal(e.fechaHora);
  const [fecha, setFecha] = useState(actual);
  const [errorServidor, setErrorServidor] = useState<ReturnType<typeof errorDelServidor> | null>(
    null,
  );
  const sinCambio = fecha === actual;
  const errorFecha = sinCambio ? undefined : errorDeFecha(fecha);

  const reprogramar = useMutation({
    mutationFn: () => estudiosApi.reprogramar(e.id, new Date(fecha).toISOString()),
    onSuccess: (nuevo) => {
      refrescar(nuevo);
      alTerminar({
        tipo: 'exito',
        texto: `Se reprogramó ${nuevo.nombre} para el ${fechaYHora(nuevo.fechaHora)}.`,
        estudio: nuevo,
      });
    },
    onError: (err) => {
      if (esNoProgramado(err)) {
        refrescar(e);
        alTerminar(RESULTADO_NO_PROGRAMADO);
        return;
      }
      // Otra persona pudo haberlo reprogramado a esa misma hora: se actualiza la lista.
      if (err instanceof ErrorApi && err.codigo === 'SIN_CAMBIOS') refrescar(e);
      setErrorServidor(errorDelServidor(err));
    },
  });

  return (
    <ModalConfirmacion
      abierto
      titulo="Reprogramar estudio"
      mensaje={
        <>
          <Typography>
            <strong>{e.nombre}</strong> de {identidad(paciente)}.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            Está programado para el <strong>{fechaYHora(e.fechaHora)}</strong>. Si tenía un
            recordatorio sin atender, se cancela y se genera el de la hora nueva.
          </Typography>
        </>
      }
      textoConfirmar="Reprogramar"
      confirmarDeshabilitado={sinCambio || Boolean(errorFecha)}
      cargando={reprogramar.isPending}
      alConfirmar={() => {
        setErrorServidor(null);
        reprogramar.mutate();
      }}
      alCancelar={alCerrar}
    >
      <Box sx={{ mt: 2 }}>
        {errorServidor && !errorServidor.campo && (
          <Alerta tipo="error">{errorServidor.texto}</Alerta>
        )}
        <CampoTexto
          etiqueta="Nueva fecha y hora"
          valor={fecha}
          alCambiar={(v) => {
            setFecha(v);
            setErrorServidor(null);
          }}
          error={errorFecha ?? (errorServidor?.campo ? errorServidor.texto : undefined)}
          ayuda={
            sinCambio
              ? 'Elija una fecha y hora distinta de la actual'
              : sinCortes('Entre 5 min atrás y 90 días adelante')
          }
          required
          fullWidth
          type="datetime-local"
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
    </ModalConfirmacion>
  );
}

/** Cancelar (T512) con motivo: cancela el estudio y sus recordatorios sin atender. */
export function DialogoCancelarEstudio({ estudio: e, paciente, alCerrar, alTerminar }: Props) {
  const refrescar = useRefrescarEstudios();

  const cancelar = useMutation({
    mutationFn: (motivo: string) => estudiosApi.cancelar(e.id, motivo),
    onSuccess: (cancelado) => {
      refrescar(cancelado);
      alTerminar({ tipo: 'exito', texto: `Se canceló ${cancelado.nombre}.`, estudio: cancelado });
    },
    onError: (err) => {
      if (esNoProgramado(err)) {
        refrescar(e);
        alTerminar(RESULTADO_NO_PROGRAMADO);
      }
    },
  });

  return (
    <ModalConfirmacion
      abierto
      titulo="Cancelar el estudio"
      mensaje={
        <>
          <Typography>
            Se cancela <strong>{e.nombre}</strong>, programado para el {fechaYHora(e.fechaHora)}, de{' '}
            {identidad(paciente)}.
          </Typography>
          <Typography sx={{ mt: 1 }}>
            No se puede deshacer: si hace falta, se lo programa de nuevo. Sus recordatorios sin
            atender también se cancelan.
          </Typography>
        </>
      }
      textoConfirmar="Cancelar estudio"
      // "Cancelar" a secas se confundiría con la acción: este botón vuelve sin cancelar nada.
      textoCancelar="Volver"
      peligroso
      pedirMotivo
      etiquetaMotivo="Motivo de la cancelación"
      ayudaMotivo="Por ejemplo: se suspendió el turno"
      cargando={cancelar.isPending}
      alConfirmar={(motivo) => cancelar.mutate(motivo ?? '')}
      alCancelar={alCerrar}
    >
      {cancelar.isError && !esNoProgramado(cancelar.error) && (
        <Box sx={{ mt: 2 }}>
          <Alerta tipo="error">{errorDelServidor(cancelar.error).texto}</Alerta>
        </Box>
      )}
    </ModalConfirmacion>
  );
}
