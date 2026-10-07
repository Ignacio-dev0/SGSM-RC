import { useEffect, useId, useState } from 'react';
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import { useMutation } from '@tanstack/react-query';
import { estudiosApi, useEstudio, type Estudio } from '../../api/estudios';
import { usePaciente } from '../../api/pacientes';
import { useValidacionFacial } from '../../biometria/useValidacionFacial';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { cerrarSinTocarAfuera } from '../../componentes/dialogos';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import {
  MENSAJE_NO_PROGRAMADO,
  errorDelServidor,
  esNoProgramado,
  fechaYHora,
  identidad,
  pacienteDelEstudio,
  type PacienteDelEstudio,
} from './etiquetas';
import {
  RESULTADO_NO_PROGRAMADO,
  useRefrescarEstudios,
  type ResultadoEstudio,
} from './useRefrescarEstudios';

export interface DatosConocidos {
  /** El estudio como ya se ve en pantalla: se muestra enseguida mientras llega el actual. */
  estudio?: Estudio;
  /** Quién es el paciente; si no se indica, se pide al servidor. */
  paciente?: PacienteDelEstudio;
}

interface Props extends DatosConocidos {
  estudioId: number;
  alCerrar: () => void;
  alTerminar: (r: ResultadoEstudio) => void;
}

/** Qué se confirma: estudio, hora, preparación y paciente (también junto a la cámara). */
function Resumen({ e, paciente }: { e: Estudio; paciente: PacienteDelEstudio | undefined }) {
  return (
    <>
      <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', overflowWrap: 'anywhere' }}>
        {e.nombre}
      </Typography>
      {e.nombre !== e.tipoEstudio.nombre && (
        <Typography color="text.secondary">{e.tipoEstudio.nombre}</Typography>
      )}
      <Typography>
        Programado para el <strong>{fechaYHora(e.fechaHora)}</strong>
      </Typography>
      {e.preparacion && <Typography>Preparación: {e.preparacion}</Typography>}
      <Typography sx={{ fontWeight: 700, mt: 1 }}>
        {paciente ? identidad(paciente) : 'Buscando los datos del paciente…'}
      </Typography>
    </>
  );
}

/**
 * Confirmar con el rostro que un estudio se realizó (T513 · S15). Pide el estudio por su id (así
 * se ve su estado actual), muestra qué se confirma y a qué paciente, pide la validación facial
 * de quien confirma y manda el comprobante con las observaciones.
 */
export function DialogoConfirmarEstudio({
  estudioId,
  estudio: conocido,
  paciente: pacienteDado,
  alCerrar,
  alTerminar,
}: Props) {
  const idTitulo = useId();
  const consulta = useEstudio(estudioId, conocido);
  const e = consulta.data;
  const pacienteConsulta = usePaciente(pacienteDado || !e ? 0 : e.pacienteId);
  const paciente =
    pacienteDado ?? (pacienteConsulta.data ? pacienteDelEstudio(pacienteConsulta.data) : undefined);
  const refrescar = useRefrescarEstudios();
  const { pedirValidacion, modalValidacion } = useValidacionFacial();
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirmar = useMutation({
    mutationFn: (validacionToken: string) =>
      estudiosApi.confirmar(estudioId, {
        validacionToken,
        ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
      }),
    onSuccess: (hecho) => {
      refrescar(hecho);
      // Nombra al paciente: desde el panel, la tarjeta que lo decía ya no está (E5-14).
      const a = paciente ? ` a ${paciente.apellido}, ${paciente.nombre}` : '';
      alTerminar({
        tipo: 'exito',
        texto: `Se confirmó que se realizó ${hecho.nombre}${a} (${fechaYHora(hecho.realizadoEn)}).`,
        estudio: hecho,
      });
    },
    onError: (err) => {
      if (esNoProgramado(err)) {
        refrescar(e);
        alTerminar(RESULTADO_NO_PROGRAMADO);
        return;
      }
      // Un rechazo por las reglas no gasta el comprobante, pero se pide de nuevo (D33).
      setError(errorDelServidor(err).texto);
    },
  });

  // Ya no está programado (otra persona lo confirmó o canceló): no hay nada que confirmar.
  const cerrado = Boolean(e && e.estado !== 'PROGRAMADO' && !consulta.isPlaceholderData);
  useEffect(() => {
    if (cerrado) refrescar();
  }, [cerrado, refrescar]);

  const pedirRostro = async () => {
    if (!e) return;
    setError(null);
    const token = await pedirValidacion(
      `Confirmar estudio ${e.nombre}${paciente ? ` de ${paciente.apellido}, ${paciente.nombre}` : ''}`,
      <Resumen e={e} paciente={paciente} />,
    );
    if (token) confirmar.mutate(token);
  };

  return (
    <Dialog
      open
      onClose={confirmar.isPending ? undefined : cerrarSinTocarAfuera(alCerrar)}
      fullWidth
      maxWidth="sm"
      aria-labelledby={idTitulo}
    >
      <DialogTitle id={idTitulo}>Confirmar que se realizó el estudio</DialogTitle>
      <DialogContent>
        {!e && consulta.isError ? (
          <ErrorDeCarga
            que="el estudio"
            error={consulta.error}
            alReintentar={() => void consulta.refetch()}
          />
        ) : !e ? (
          <Cargando texto="Cargando el estudio…" />
        ) : cerrado ? (
          <Alerta tipo="advertencia">{MENSAJE_NO_PROGRAMADO}.</Alerta>
        ) : (
          <>
            {error && (
              // Arriba, lejos del botón tocado: se lleva a la vista y toma el foco (E5-10).
              <Alerta tipo="error" enfocar>
                {error}
              </Alerta>
            )}
            <Box
              component="section"
              aria-label="Revise antes de confirmar"
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.default',
              }}
            >
              <Resumen e={e} paciente={paciente} />
            </Box>
            <CampoTexto
              etiqueta="Observaciones (opcional)"
              valor={observaciones}
              alCambiar={setObservaciones}
              ayuda="Por ejemplo: sin novedad, se tomó la muestra a las 08:10"
              multiline
              minRows={2}
              fullWidth
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap' }}>
        {cerrado ? (
          <Boton onClick={alCerrar}>Cerrar</Boton>
        ) : (
          <>
            <Boton variante="texto" onClick={alCerrar} disabled={confirmar.isPending}>
              Cancelar
            </Boton>
            <Boton
              startIcon={<FaceRetouchingNaturalIcon />}
              disabled={!e}
              cargando={confirmar.isPending}
              onClick={() => void pedirRostro()}
            >
              Confirmar con mi rostro
            </Boton>
          </>
        )}
      </DialogActions>
      {modalValidacion}
    </Dialog>
  );
}
