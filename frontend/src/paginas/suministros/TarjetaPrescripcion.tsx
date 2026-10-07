import { Box, Card, CardActionArea, CardContent, Chip, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import type { Prescripcion } from '../../api/tipos';
import { tinte } from '../../tema';
import { formatearFechaHora, formatearHora } from '../../utilidades/formato';
import { etiquetaVia, formatearDosis, formatearFrecuencia } from '../prescripciones/etiquetas';
import { colorEstadoToma, estadoToma, textoEstadoToma, varianteEstadoToma } from './estadoToma';

/** Primario al 8 % (`tinte` sigue al tema claro u oscuro): el fondo de la tarjeta elegida. */
const OPACIDAD_ELEGIDA = 0.08;

/** Marcador de la derecha: círculo vacío en reposo, tilde al elegirla, siempre del mismo tamaño. */
const MARCADOR = { fontSize: 36, flexShrink: 0 };

/**
 * Prescripción vigente para elegir al lado de la cama, con el estado de su toma. La elegida se
 * distingue por borde y tinte del color primario (no por un gris, que se leería "deshabilitada").
 */
export function TarjetaPrescripcion({
  p,
  elegida,
  ahora,
  alElegir,
}: {
  p: Prescripcion;
  elegida: boolean;
  ahora: Date;
  alElegir: () => void;
}) {
  const ultima = p.ultimasAdministraciones[0];
  const estado = estadoToma(p, ahora);
  return (
    <Card
      variant="outlined"
      sx={(t) => ({
        borderWidth: 2,
        borderColor: elegida ? 'primary.main' : 'divider',
        bgcolor: elegida ? tinte(t, 'primary', OPACIDAD_ELEGIDA) : undefined,
      })}
    >
      <CardActionArea onClick={alElegir} aria-pressed={elegida} sx={{ p: 1 }}>
        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" component="p">
                {p.medicamento.nombre} {formatearDosis(p.dosis, p.unidadDosis)}
              </Typography>
              <Chip
                label={textoEstadoToma(estado)}
                color={colorEstadoToma(estado)}
                variant={varianteEstadoToma(estado)}
                // Una toma ya dada avisa también con el ícono, no solo con el color.
                icon={estado.tipo === 'dada' ? <HistoryOutlinedIcon /> : undefined}
              />
            </Box>
            <Typography color="text.secondary">
              {etiquetaVia(p.via)} · {formatearFrecuencia(p.frecuenciaHoras)}
              {p.observaciones ? ` · ${p.observaciones}` : ''}
            </Typography>
            <Typography sx={{ mt: 0.5 }}>
              Próxima toma: <strong>{p.proximaToma ? formatearHora(p.proximaToma) : '—'}</strong>
              {ultima && ` · Última: ${formatearFechaHora(ultima.fechaHora)} (${ultima.usuario})`}
            </Typography>
          </Box>
          {elegida ? (
            <CheckCircleIcon color="primary" sx={MARCADOR} />
          ) : (
            <RadioButtonUncheckedIcon sx={{ ...MARCADOR, color: 'action.active' }} />
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
