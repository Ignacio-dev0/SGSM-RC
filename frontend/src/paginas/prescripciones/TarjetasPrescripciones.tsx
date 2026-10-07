import { useId } from 'react';
import { Box, ButtonBase, LinearProgress, Paper, Typography } from '@mui/material';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import type { Prescripcion } from '../../api/tipos';
import { Boton } from '../../componentes/Boton';
import { ChipEstado } from '../../componentes/ChipEstado';
import { formatearFechaHora } from '../../utilidades/formato';
import { ChipEstadoToma } from './ChipEstadoToma';
import { etiquetaVia, formatearDosis, formatearFrecuencia } from './etiquetas';
import { formatearProximaToma } from './proximaToma';

interface PropsTarjeta {
  p: Prescripcion;
  ahora: Date;
  /** Si se ofrece Administrar (permiso y paciente internado); solo se muestra en las vigentes. */
  administra: boolean;
  alAbrir: (p: Prescripcion) => void;
  alAdministrar: (p: Prescripcion) => void;
}

/**
 * Una prescripción como tarjeta: medicamento y dosis a la vista, estado de la prescripción y de
 * la toma, y Administrar. Toda la tarjeta abre el detalle: el botón que lo hace (con foco visible
 * y Enter/Espacio nativos) es un hermano del contenido y no su envoltorio, así Administrar nunca
 * queda dentro de otro botón.
 */
function TarjetaDePrescripcion({ p, ahora, administra, alAbrir, alAdministrar }: PropsTarjeta) {
  const id = useId();
  const ultima = p.ultimasAdministraciones[0];
  const vigente = p.estado === 'VIGENTE';
  const ultimaTexto = ultima
    ? `${formatearFechaHora(ultima.fechaHora)} (${ultima.usuario})`
    : 'sin registros';

  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{
        position: 'relative',
        '@media (hover: hover)': { '&:hover': { bgcolor: 'action.hover' } },
        '&:active': { bgcolor: 'action.selected' },
      }}
    >
      <ButtonBase
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-datos`}
        onClick={() => alAbrir(p)}
        disableRipple
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          '&.Mui-focusVisible': {
            outline: '3px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      />
      <Box onClick={() => alAbrir(p)} sx={{ position: 'relative', p: 2, cursor: 'pointer' }}>
        <Typography
          id={`${id}-titulo`}
          component="div"
          sx={{ fontWeight: 700, fontSize: '1.25rem', overflowWrap: 'anywhere' }}
        >
          {p.medicamento.nombre} {formatearDosis(p.dosis, p.unidadDosis)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {p.medicamento.presentacion}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1 }}>
          <ChipEstado estado={p.estado} />
          <ChipEstadoToma prescripcion={p} ahora={ahora} tamano="medium" />
        </Box>
        <Box id={`${id}-datos`} sx={{ mt: 1 }}>
          <Typography>
            {etiquetaVia(p.via)} · {formatearFrecuencia(p.frecuenciaHoras)}
          </Typography>
          <Typography>
            {p.proximaToma && (
              <>
                Próxima: <strong>{formatearProximaToma(p.proximaToma, ahora)}</strong>
                {' · '}
              </>
            )}
            Última: {ultimaTexto}
          </Typography>
        </Box>
        {administra && vigente && (
          <Boton
            variante="secundario"
            startIcon={<MedicationOutlinedIcon />}
            aria-label={`Administrar ${p.medicamento.nombre}`}
            // Sin esto, el toque también abriría el detalle de la prescripción.
            onClick={(e) => {
              e.stopPropagation();
              alAdministrar(p);
            }}
            sx={{ mt: 2, width: { xs: '100%', sm: 'auto' } }}
          >
            Administrar
          </Boton>
        )}
      </Box>
    </Paper>
  );
}

/**
 * Prescripciones del paciente como tarjetas, para pantallas angostas (tablet vertical y
 * teléfono): la tabla obliga a desplazarse y esconde "Última administración" y Administrar.
 */
export function TarjetasPrescripciones({
  prescripciones,
  cargando,
  mensajeVacio,
  ...resto
}: Omit<PropsTarjeta, 'p'> & {
  prescripciones: Prescripcion[];
  cargando: boolean;
  mensajeVacio: string;
}) {
  return (
    <Box>
      {cargando && <LinearProgress aria-label="Cargando" sx={{ mb: 1.5 }} />}
      {prescripciones.length > 0 ? (
        <Box
          component="ul"
          // role explícito: Safari no anuncia como lista a una <ul> sin viñetas.
          role="list"
          aria-label="Prescripciones"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          {prescripciones.map((p) => (
            <TarjetaDePrescripcion key={p.id} p={p} {...resto} />
          ))}
        </Box>
      ) : (
        !cargando && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">{mensajeVacio}</Typography>
          </Paper>
        )
      )}
    </Box>
  );
}
