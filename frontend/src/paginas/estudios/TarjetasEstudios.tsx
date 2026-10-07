import { useId, type ReactNode } from 'react';
import { Box, Chip, Paper, Typography } from '@mui/material';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import type { EstadoEstudio, Estudio } from '../../api/estudios';
import { Boton } from '../../componentes/Boton';
import { ESTADOS_ESTUDIO, fechaYHora } from './etiquetas';

/**
 * Estado del estudio con la regla de ChipEstado (28 px, contorno para lo esperable y relleno
 * neutro para lo cerrado). Va aparte de ESTADOS_CHIP porque es propio de los estudios.
 */
export function ChipEstadoEstudio({ estado }: { estado: EstadoEstudio }) {
  const { etiqueta, variante } = ESTADOS_ESTUDIO[estado];
  return (
    <Chip
      label={etiqueta}
      color="default"
      variant={variante}
      sx={{ height: 28, fontSize: '0.875rem' }}
    />
  );
}

/** Par "título: valor" de la tarjeta. */
function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <Box>
      <Typography component="dt" variant="body2" color="text.secondary">
        {etiqueta}
      </Typography>
      <Typography component="dd" sx={{ m: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

/** Qué puede hacer quien mira con un estudio programado (cada una, si tiene el permiso). */
export interface AccionesEstudio {
  alReprogramar?: (e: Estudio) => void;
  alCancelar?: (e: Estudio) => void;
  alConfirmar?: (e: Estudio) => void;
}

function TarjetaEstudio({
  estudio: e,
  alReprogramar,
  alCancelar,
  alConfirmar,
}: AccionesEstudio & { estudio: Estudio }) {
  const idTitulo = useId();
  const programado = e.estado === 'PROGRAMADO';
  const hayAcciones = programado && Boolean(alReprogramar || alCancelar || alConfirmar);

  return (
    <Paper component="li" variant="outlined" aria-labelledby={idTitulo} sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5 }}>
        <Typography
          id={idTitulo}
          component="h3"
          sx={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.3, overflowWrap: 'anywhere' }}
        >
          {e.nombre}
        </Typography>
        <ChipEstadoEstudio estado={e.estado} />
      </Box>
      {e.nombre !== e.tipoEstudio.nombre && (
        <Typography color="text.secondary">{e.tipoEstudio.nombre}</Typography>
      )}

      <Box
        component="dl"
        sx={{
          display: 'grid',
          gap: 1.5,
          // Una columna en teléfono; de a dos desde tablet.
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          mt: 1.5,
          mb: 0,
        }}
      >
        <Dato etiqueta="Fecha y hora">{fechaYHora(e.fechaHora)}</Dato>
        {e.estado === 'CANCELADO' && (
          <Dato etiqueta="Motivo de la cancelación">{e.motivoCancelacion}</Dato>
        )}
        {e.estado === 'REALIZADO' && (
          <Dato etiqueta="Confirmó que se realizó">
            {e.confirmadoPor?.nombre} · {fechaYHora(e.realizadoEn)}
          </Dato>
        )}
        {e.observacionesRealizacion && (
          <Dato etiqueta="Observaciones de quien confirmó">{e.observacionesRealizacion}</Dato>
        )}
        {e.preparacion && <Dato etiqueta="Preparación">{e.preparacion}</Dato>}
        {e.observaciones && <Dato etiqueta="Observaciones">{e.observaciones}</Dato>}
        <Dato etiqueta="Programó">{e.creadoPor.nombre}</Dato>
      </Box>

      {hayAcciones && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            flexWrap: 'wrap',
            justifyContent: { sm: 'flex-end' },
            gap: 1,
            mt: 2,
            // En teléfono, cada botón a lo ancho (objetivo táctil cómodo con el pulgar).
            '& > *': { width: { xs: '100%', sm: 'auto' } },
          }}
        >
          {alCancelar && (
            <Boton
              variante="peligro"
              aria-label={`Cancelar estudio ${e.nombre}`}
              onClick={() => alCancelar(e)}
            >
              Cancelar estudio
            </Boton>
          )}
          {alReprogramar && (
            <Boton
              variante="secundario"
              startIcon={<EventRepeatOutlinedIcon />}
              aria-label={`Reprogramar ${e.nombre}`}
              onClick={() => alReprogramar(e)}
            >
              Reprogramar
            </Boton>
          )}
          {alConfirmar && (
            <Boton
              variante="secundario"
              startIcon={<FaceRetouchingNaturalIcon />}
              aria-label={`Confirmar que se realizó ${e.nombre}`}
              onClick={() => alConfirmar(e)}
            >
              Confirmar que se realizó
            </Boton>
          )}
        </Box>
      )}
    </Paper>
  );
}

/** Una sección de la pestaña ("Programados", "Realizados y cancelados") con sus tarjetas. */
export function ListaEstudios({
  titulo,
  estudios,
  vacio,
  ...acciones
}: AccionesEstudio & {
  titulo: string;
  estudios: Estudio[];
  /** Lo que se muestra si no hay ninguno (por ejemplo, el aviso con Programar estudio). */
  vacio?: ReactNode;
}) {
  const idTitulo = useId();
  return (
    <Box component="section" aria-labelledby={idTitulo} sx={{ mb: 3 }}>
      <Typography id={idTitulo} variant="h6" component="h2" sx={{ mb: 1.5 }}>
        {titulo}
      </Typography>
      {estudios.length > 0 ? (
        <Box
          component="ul"
          // role explícito: Safari no anuncia como lista a una <ul> sin viñetas.
          role="list"
          aria-labelledby={idTitulo}
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}
        >
          {estudios.map((e) => (
            <TarjetaEstudio key={e.id} estudio={e} {...acciones} />
          ))}
        </Box>
      ) : (
        vacio
      )}
    </Box>
  );
}
